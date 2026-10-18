import { env } from 'cloudflare:workers';
import { decrypt, encrypt } from 'paseto-ts/v4';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKakaoAuthRuntime } from '@/infra/auth/kakao/runtime';
import { normalizePasetoLocalKey } from '@/infra/auth/session/keyring';
import { createApp } from '@/infra/http/app';
import { createD1UserIdentityRepository } from '@/infra/persistence/d1-user-identity-repository';
import type { OAuthIdentity } from '@/domain/auth/identity';
import migration0000 from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import migration0001 from '../../drizzle/migrations/0001_add-users-external-identities.sql?raw';
import migration0002 from '../../drizzle/migrations/0002_add-sessions.sql?raw';
import {
  applyD1Migrations,
  createFakeKakaoServer,
  FAKE_CLIENT_ID,
  FAKE_SUB,
  type FakeKakaoServer,
} from './fixtures/kakao-fakes';

// 이슈 #4 (ADR-0005/0006) Worker+D1 통합 테스트 — 실제 마이그레이션·PASETO 세션 발급/검증/
// 로그아웃(폐기·쿠키 삭제)·CSRF·키 회전·redaction 증명. 실제 카카오 미사용.

const db = env.DB;

/** 32바이트 무작위 표준 base64 키(put-paseto-key.sh가 .dev.vars에 쓰는 형식과 동일). */
function randomBase64Key(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const KEY_V1 = randomBase64Key();
const KEY_V2 = randomBase64Key();

function envWithKeys(keys: { v1: string; v2?: string }): Env {
  const merged = { ...env, PASETO_KEY_V1: keys.v1 } as Record<string, unknown>;
  if (keys.v2 !== undefined) merged.PASETO_KEY_V2 = keys.v2;
  return merged as unknown as Env;
}

interface Capture {
  identity: OAuthIdentity | null;
}
const capture: Capture = { identity: null };

function createAppWithSpy() {
  capture.identity = null;
  return createApp({
    createAuthRuntime: (workerEnv, requestId) => {
      const runtime = createKakaoAuthRuntime(workerEnv, requestId, { sharedJwks: false });
      return {
        ...runtime,
        complete: {
          ...runtime.complete,
          oidcVerifier: {
            verify: async (input: { idToken: string; nonce: string }) => {
              const identity = await runtime.complete.oidcVerifier.verify(input);
              capture.identity = identity;
              return identity;
            },
          },
        },
      };
    },
  });
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002]);
});

beforeEach(async () => {
  await db.prepare('DELETE FROM sessions').run();
  await db.prepare('DELETE FROM external_identities').run();
  await db.prepare('DELETE FROM users').run();
  await db.prepare('DELETE FROM oauth_states').run();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function count(table: 'users' | 'external_identities' | 'sessions'): Promise<number> {
  const row = await db.prepare(`SELECT count(*) AS c FROM ${table}`).first<{ c: number }>();
  return row?.c ?? 0;
}

async function startLogin(app: ReturnType<typeof createApp>, testEnv: Env) {
  const res = await app.fetch(new Request('https://moi.test/auth/kakao'), testEnv);
  expect(res.status).toBe(302);
  const locationHeader = res.headers.get('location');
  expect(locationHeader).not.toBeNull();
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/__Host-moi_oauth=([^;]+)/);
  expect(match).not.toBeNull();
  return {
    location: new URL(locationHeader as string),
    state: new URL(locationHeader as string).searchParams.get('state') ?? '',
    binding: match?.[1] ?? '',
  };
}

/** 로그인 시작 → DB 행 확인 → 유효한 ID token으로 fake 토큰 응답 구성. */
async function arrangeValidCallback(fake: FakeKakaoServer, app: ReturnType<typeof createApp>, testEnv: Env) {
  const started = await startLogin(app, testEnv);
  const stateHashRow = await db
    .prepare('SELECT nonce FROM oauth_states WHERE state_hash = ?1')
    .bind(await sha256Hex(started.state))
    .first<{ nonce: string }>();
  expect(stateHashRow).not.toBeNull();
  const now = Math.floor(Date.now() / 1000);
  const idToken = await fake.signIdToken({
    iss: 'https://kauth.kakao.com',
    aud: FAKE_CLIENT_ID,
    sub: FAKE_SUB,
    iat: now,
    exp: now + 600,
    nonce: (stateHashRow as { nonce: string }).nonce,
  });
  fake.setTokenResponse({
    status: 200,
    body: JSON.stringify({ access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600, id_token: idToken }),
  });
  return { ...started, idToken };
}

function callbackRequest(state: string, options?: { code?: string | null; binding?: string | null; error?: string }) {
  const url = new URL('https://moi.test/auth/kakao/callback');
  if (options?.code !== null) url.searchParams.set('code', options?.code ?? 'auth-code-123');
  if (options?.error) url.searchParams.set('error', options.error);
  url.searchParams.set('state', state);
  const headers: Record<string, string> = {};
  if (options?.binding !== null && options?.binding !== undefined) {
    headers.cookie = `__Host-moi_oauth=${options.binding}`;
  }
  return new Request(url, { headers });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extractCookie(res: Response, name: string): string | null {
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(new RegExp(`${name}=([^;]*)`));
  return match?.[1] ?? null;
}

/** Set-Cookie 헤더를 개별 행으로 분리한다(workerd는 ', '로 결합해 내려올 수 있다). */
function splitSetCookie(res: Response): string[] {
  return (res.headers.get('set-cookie') ?? '')
    .split(/,(?=[^;]+=)/)
    .map((line) => line.trim());
}

async function performLogin(app: ReturnType<typeof createApp>, testEnv: Env): Promise<string> {
  const fake = await createFakeKakaoServer();
  vi.stubGlobal('fetch', fake.fetch);
  const arranged = await arrangeValidCallback(fake, app, testEnv);
  const res = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('/?auth=success');
  const token = extractCookie(res, '__Host-moi_session');
  expect(token).not.toBeNull();
  return token as string;
}

describe('세션 스키마·마이그레이션 (0002_add-sessions)', () => {
  it('sessions 테이블(jti_hash PK·FK)이 만들어진다', async () => {
    const table = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
      .first<{ sql: string }>();
    expect(table?.sql).toContain('jti_hash');
    expect(table?.sql).toContain('FOREIGN KEY');
  });

  it('FK: 미존재 user_id의 session row는 거부한다', async () => {
    const insert = db
      .prepare(
        "INSERT INTO sessions (jti_hash, user_id, issued_at, expires_at) VALUES ('h', 'missing-user', 1, 2)",
      )
      .run();
    await expect(insert).rejects.toThrow();
  });
});

describe('로그인 → 세션 발급 → /api/me', () => {
  it('AC: callback 성공 → resolveOrCreate → 세션 발급(302 /?auth=success + 쿠키) → /api/me 같은 userId', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app, testEnv);

    const res = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth=success');
    expect(res.headers.get('cache-control')).toBe('no-store');

    // 세션 쿠키 속성: __Host- + Secure + HttpOnly + SameSite=Lax + Path=/ + Domain 없음 + Max-Age=86400
    const sessionCookieLine = splitSetCookie(res).find((line) => line.includes('__Host-moi_session='));
    expect(sessionCookieLine).toBeDefined();
    expect(sessionCookieLine).toContain('__Host-moi_session=');
    expect(sessionCookieLine).toContain('Max-Age=86400');
    expect(sessionCookieLine).toContain('Path=/');
    expect(sessionCookieLine).toContain('Secure');
    expect(sessionCookieLine).toContain('HttpOnly');
    expect(sessionCookieLine).toContain('SameSite=Lax');
    expect(sessionCookieLine?.toLowerCase()).not.toContain('domain=');
    // 임시 oauth 쿠키는 삭제된다(Max-Age=0)
    expect(splitSetCookie(res).some((line) => line.startsWith('__Host-moi_oauth=; Max-Age=0'))).toBe(true);

    const sessionToken = extractCookie(res, '__Host-moi_session') as string;

    // identity는 브라우저에 노출되지 않는다(redirect body/location에 없음)
    expect(res.headers.get('location')?.includes(FAKE_SUB)).toBe(false);

    // /api/me: 같은 내부 user_id
    const me = await app.fetch(
      new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${sessionToken}` } }),
      testEnv,
    );
    expect(me.status).toBe(200);
    expect(me.headers.get('cache-control')).toBe('no-store');
    const body = (await me.json()) as { user: { id: string } };
    expect(body.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(body.user.id).not.toBe(FAKE_SUB); // 외부 sub가 아닌 내부 UUID

    // D1: users 1건, identity 매핑(sub → 같은 user_id), sessions 1건
    expect(await count('users')).toBe(1);
    const identityRepo = createD1UserIdentityRepository(db);
    const identity = await identityRepo.findIdentity({ provider: 'kakao', subject: FAKE_SUB });
    expect(identity?.userId).toBe(body.user.id);
    expect(await count('sessions')).toBe(1);
    expect(capture.identity).toEqual({ provider: 'kakao', sub: FAKE_SUB });
  });

  it('매 로그인 새 세션(jti): 두 번 로그인하면 sessions 2건·각각 다른 쿠키', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const tokenA = await performLogin(app, testEnv);
    const tokenB = await performLogin(app, testEnv);

    expect(tokenA).not.toBe(tokenB);
    expect(await count('sessions')).toBe(2);
    const meA = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${tokenA}` } }), testEnv);
    const meB = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${tokenB}` } }), testEnv);
    expect(meA.status).toBe(200);
    expect(meB.status).toBe(200);
    const bodyA = (await meA.json()) as { user: { id: string } };
    const bodyB = (await meB.json()) as { user: { id: string } };
    expect(bodyA.user.id).toBe(bodyB.user.id); // 동일 사용자(동일 sub 재로그인)
  });

  it('미인증 /api/me: 401 + no-store', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();

    const res = await app.fetch(new Request('https://moi.test/api/me'), testEnv);

    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('토큰 검증 거부 (401)', () => {
  it('변조 토큰: 401', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const token = await performLogin(app, testEnv);
    const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');

    const me = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${tampered}` } }), testEnv);

    expect(me.status).toBe(401);
  });

  it('만료 토큰: 401', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const paserk = normalizePasetoLocalKey(KEY_V1);
    const nowMs = Date.now();
    const expiredToken = await encrypt(
      paserk,
      { sub: '0f9f1a3e-6f1a-4c2e-8f0b-0000000000e1', jti: 'expired-jti', iat: new Date(nowMs - 200_000).toISOString(), exp: new Date(nowMs - 100_000).toISOString() },
      { validatePayload: false },
    );

    const me = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${expiredToken}` } }), testEnv);

    expect(me.status).toBe(401);
  });

  it('미지 키(키링 외부) 토큰: 401', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const otherPaserk = normalizePasetoLocalKey(randomBase64Key());
    const nowMs = Date.now();
    const foreignToken = await encrypt(otherPaserk, {
      sub: '0f9f1a3e-6f1a-4c2e-8f0b-0000000000e2',
      jti: 'foreign-jti',
      iat: new Date(nowMs).toISOString(),
      exp: new Date(nowMs + 600_000).toISOString(),
    });

    const me = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${foreignToken}` } }), testEnv);

    expect(me.status).toBe(401);
  });

  it('폐기된 jti(로그아웃 후): 401', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const token = await performLogin(app, testEnv);
    const logout = await app.fetch(
      new Request('https://moi.test/auth/logout', {
        method: 'POST',
        headers: { cookie: `__Host-moi_session=${token}`, origin: 'https://moi.test', 'sec-fetch-site': 'same-origin' },
      }),
      testEnv,
    );
    expect(logout.status).toBe(204);

    const me = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${token}` } }), testEnv);

    expect(me.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('성공: 204 + 쿠키 삭제(Max-Age=0) + D1 revoke', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const token = await performLogin(app, testEnv);

    const res = await app.fetch(
      new Request('https://moi.test/auth/logout', {
        method: 'POST',
        headers: { cookie: `__Host-moi_session=${token}`, origin: 'https://moi.test', 'sec-fetch-site': 'same-origin' },
      }),
      testEnv,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const clearance = res.headers.get('set-cookie') ?? '';
    expect(clearance).toContain('__Host-moi_session=; Max-Age=0');
    expect(clearance).toContain('Path=/');
    expect(clearance).toContain('Secure');
    expect(clearance).toContain('HttpOnly');
    expect(clearance).toContain('SameSite=Lax');
    expect(clearance.toLowerCase()).not.toContain('domain=');
    const revoked = await db.prepare('SELECT revoked_at FROM sessions WHERE revoked_at IS NOT NULL').all();
    expect(revoked.results).toHaveLength(1);
  });

  it('CSRF: Origin 불일치 → 403 + revoke 없음', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const token = await performLogin(app, testEnv);

    const res = await app.fetch(
      new Request('https://moi.test/auth/logout', {
        method: 'POST',
        headers: { cookie: `__Host-moi_session=${token}`, origin: 'https://evil.test' },
      }),
      testEnv,
    );

    expect(res.status).toBe(403);
    expect(await count('sessions')).toBe(1);
    const revoked = await db.prepare('SELECT revoked_at FROM sessions WHERE revoked_at IS NOT NULL').all();
    expect(revoked.results).toHaveLength(0);
  });

  it('CSRF: Sec-Fetch-Site cross-site → 403', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const token = await performLogin(app, testEnv);

    const res = await app.fetch(
      new Request('https://moi.test/auth/logout', {
        method: 'POST',
        headers: { cookie: `__Host-moi_session=${token}`, origin: 'https://moi.test', 'sec-fetch-site': 'cross-site' },
      }),
      testEnv,
    );

    expect(res.status).toBe(403);
    expect((await db.prepare('SELECT revoked_at FROM sessions WHERE revoked_at IS NOT NULL').all()).results).toHaveLength(0);
  });

  it('미인증(쿠키 없음): 401', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();

    const res = await app.fetch(new Request('https://moi.test/auth/logout', { method: 'POST' }), testEnv);

    expect(res.status).toBe(401);
  });

  it('같은 PASETO 재사용(재로그아웃): 401', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const token = await performLogin(app, testEnv);
    const first = await app.fetch(
      new Request('https://moi.test/auth/logout', {
        method: 'POST',
        headers: { cookie: `__Host-moi_session=${token}`, origin: 'https://moi.test', 'sec-fetch-site': 'same-origin' },
      }),
      testEnv,
    );
    expect(first.status).toBe(204);

    const second = await app.fetch(
      new Request('https://moi.test/auth/logout', {
        method: 'POST',
        headers: { cookie: `__Host-moi_session=${token}`, origin: 'https://moi.test', 'sec-fetch-site': 'same-origin' },
      }),
      testEnv,
    );

    expect(second.status).toBe(401);
  });
});

describe('키 회전 (ADR-0005 절차, 테스트 키 모사)', () => {
  it('V1+V2 공존: 이전(V1) 토큰 허용·신규 발급은 V2', async () => {
    const app = createAppWithSpy();
    const tokenV1 = await performLogin(app, envWithKeys({ v1: KEY_V1 }));

    const coexistEnv = envWithKeys({ v1: KEY_V1, v2: KEY_V2 });
    const meOld = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${tokenV1}` } }), coexistEnv);
    expect(meOld.status).toBe(200); // 이전 키 토큰 허용

    // 신규 발급(V2) 토큰은 V1-only 환경에서 검증 불가 → 발급이 current(V2)로 이뤄짐을 증명
    const tokenV2 = await performLogin(app, coexistEnv);
    const legacyEnv = envWithKeys({ v1: KEY_V1 });
    const meV2UnderLegacy = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${tokenV2}` } }), legacyEnv);
    expect(meV2UnderLegacy.status).toBe(401); // V2 토큰은 V1-only 키링에서 거부 = V2로 발급됨
  });

  it('V1 제거(교체) 후: 이전 토큰 거부', async () => {
    const app = createAppWithSpy();
    const oldToken = await performLogin(app, envWithKeys({ v1: KEY_V1 }));

    const rotatedEnv = envWithKeys({ v1: KEY_V2 }); // V1 키가 K2로 교체되고 V2 슬롯 제거
    const me = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${oldToken}` } }), rotatedEnv);
    expect(me.status).toBe(401); // 이전 키(K1) 제거 → 거부

    const newToken = await performLogin(app, rotatedEnv);
    const meNew = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${newToken}` } }), rotatedEnv);
    expect(meNew.status).toBe(200);
  });
});

describe('callback 실패 경로', () => {
  it('error=access_denied: 302 /?auth=error + 임시 쿠키 삭제 + 세션 미발급', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app, testEnv);

    const res = await app.fetch(callbackRequest(arranged.state, { code: null, error: 'access_denied', binding: arranged.binding }), testEnv);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth=error');
    expect(splitSetCookie(res).some((line) => line.startsWith('__Host-moi_oauth=; Max-Age=0'))).toBe(true);
    expect(splitSetCookie(res).some((line) => line.startsWith('__Host-moi_session='))).toBe(false);
    expect(await count('users')).toBe(0);
    expect(await count('sessions')).toBe(0);
  });

  it('재사용 state: 302 /?auth=error + 세션 미발급', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app, testEnv);
    await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);

    const res = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth=error');
    expect(splitSetCookie(res).some((line) => line.startsWith('__Host-moi_session='))).toBe(false);
  });

  it('nonce 불일치 ID token: 302 /?auth=error + 세션 미발급', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const started = await startLogin(app, testEnv);
    const now = Math.floor(Date.now() / 1000);
    const idToken = await fake.signIdToken({
      iss: 'https://kauth.kakao.com',
      aud: FAKE_CLIENT_ID,
      sub: FAKE_SUB,
      iat: now,
      exp: now + 600,
      nonce: 'mismatched-nonce',
    });
    fake.setTokenResponse({ status: 200, body: JSON.stringify({ access_token: 'a', token_type: 'bearer', expires_in: 1, id_token: idToken }) });

    const res = await app.fetch(callbackRequest(started.state, { binding: started.binding }), testEnv);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth=error');
    expect(await count('sessions')).toBe(0);
  });
});

describe('로그 redaction (ADR-0006)', () => {
  it('로그인·/api/me·로그아웃 콘솔 로그에 토큰/jti/쿠키/sub 원문이 없다', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let lines: string[] = [];
    let sessionToken = '';
    let jti = '';
    try {
      sessionToken = await performLogin(app, testEnv);
      await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${sessionToken}` } }), testEnv);
      // jti 원문 복호화(테스트만 키 보유)
      const paserk = normalizePasetoLocalKey(KEY_V1);
      const { payload } = await decrypt<{ sub: string; jti: string }>(paserk, sessionToken);
      jti = payload.jti;
      await app.fetch(
        new Request('https://moi.test/auth/logout', {
          method: 'POST',
          headers: { cookie: `__Host-moi_session=${sessionToken}`, origin: 'https://moi.test', 'sec-fetch-site': 'same-origin' },
        }),
        testEnv,
      );

      lines = logSpy.mock.calls.map((call) => String(call[0]));
      expect(lines.length).toBeGreaterThan(0);
      const all = lines.join('\n');
      for (const line of lines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        for (const key of Object.keys(parsed)) {
          expect(['level', 'msg', 'requestId', 'outcome']).toContain(key);
        }
      }
      for (const secret of [sessionToken, jti, FAKE_SUB, 'fake-access-token', `${FAKE_SUB}@`, sessionToken.slice(0, 24)]) {
        expect(all.includes(secret)).toBe(false);
      }
    } finally {
      logSpy.mockRestore();
    }
    console.log(`REDACTION_EVIDENCE:${JSON.stringify(lines)}`);
  });
});
