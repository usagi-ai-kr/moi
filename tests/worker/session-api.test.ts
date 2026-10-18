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
import migration0007 from '../../drizzle/migrations/0007_add-single-session.sql?raw';
import { createD1SessionRepository } from '@/infra/auth/session/d1-session-repository';
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

async function countActiveSessions(): Promise<number> {
  const row = await db.prepare('SELECT count(*) AS c FROM sessions WHERE revoked_at IS NULL').first<{ c: number }>();
  return row?.c ?? 0;
}

async function countRevokedSessions(): Promise<number> {
  const row = await db.prepare('SELECT count(*) AS c FROM sessions WHERE revoked_at IS NOT NULL').first<{ c: number }>();
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

/** 로그인 시작 → DB 행 확인 → 유효한 ID token으로 fake 토큰 응답 구성. sub 주입 시 다른 사용자를 흉내 낸다(#52). */
async function arrangeValidCallback(
  fake: FakeKakaoServer,
  app: ReturnType<typeof createApp>,
  testEnv: Env,
  sub: string = FAKE_SUB,
) {
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
    sub,
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

async function performLogin(app: ReturnType<typeof createApp>, testEnv: Env, sub: string = FAKE_SUB): Promise<string> {
  const fake = await createFakeKakaoServer();
  vi.stubGlobal('fetch', fake.fetch);
  const arranged = await arrangeValidCallback(fake, app, testEnv, sub);
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

describe('마이그레이션 0007_add-single-session: 중복 활성 세션 정리 + 부분 UNIQUE', () => {
  it('AC(#52): 사용자별 최신 활성 1개만 남기고 나머지를 폐기한다(전체 로그아웃 금지)', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const userC = crypto.randomUUID();
    for (const id of [userA, userB, userC]) {
      await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(id, nowSec, nowSec).run();
    }
    const insertSession = (jtiHash: string, userId: string, issuedAt: number, revokedAt: number | null) =>
      db
        .prepare('INSERT INTO sessions (jti_hash, user_id, issued_at, expires_at, revoked_at) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(jtiHash, userId, issuedAt, nowSec + 3600, revokedAt)
        .run();
    // A: 활성 3건(issued_at 순) + 이미 폐기 1건, B: 활성 2건 — 0007 이전 상태 모사
    await insertSession('a-old', userA, 100, null);
    await insertSession('a-mid', userA, 200, null);
    await insertSession('a-new', userA, 300, null);
    await insertSession('a-revoked', userA, 50, 90);
    await insertSession('b-old', userB, 100, null);
    await insertSession('b-new', userB, 200, null);

    await applyD1Migrations(db, [migration0007]);

    // 사용자별 최신(issued_at 최대) 1개만 활성 유지, 나머지는 revoked_at 기록
    const activeRows = await db
      .prepare('SELECT jti_hash, user_id FROM sessions WHERE revoked_at IS NULL ORDER BY jti_hash')
      .all<{ jti_hash: string; user_id: string }>();
    expect(activeRows.results).toEqual([
      { jti_hash: 'a-new', user_id: userA },
      { jti_hash: 'b-new', user_id: userB },
    ]);
    // 전체 로그아웃 금지: 어떤 사용자도 활성 세션을 잃지 않는다(사용자당 1개 유지)
    expect(await countActiveSessions()).toBe(2);
    expect(await count('sessions')).toBe(6); // 이력 보존(물리 삭제 없음)
    const preRevoked = await db.prepare('SELECT revoked_at FROM sessions WHERE jti_hash = ?1').bind('a-revoked').first<{ revoked_at: number }>();
    expect(preRevoked?.revoked_at).toBe(90); // 이미 폐기된 행은 손대지 않는다

    // 부분 UNIQUE 인덱스가 만들어진다
    const indexRow = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'sessions_user_active_uq'")
      .first<{ name: string }>();
    expect(indexRow?.name).toBe('sessions_user_active_uq');

    // 같은 사용자의 두 번째 활성 삽입은 거부, 다른 사용자는 허용
    await expect(insertSession('a-dup', userA, 400, null)).rejects.toThrow();
    await insertSession('c-new', userC, 400, null);
    expect(await countActiveSessions()).toBe(3);
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

  it('AC(#52 단일 활성): 재로그인 시 이전 토큰 401·새 토큰 200, sessions 2건(활성 1·폐기 1)', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const tokenA = await performLogin(app, testEnv);
    const tokenB = await performLogin(app, testEnv);

    expect(tokenA).not.toBe(tokenB);
    // 이력 보존: 행은 2건 유지하되 활성은 1건, 폐기 1건(#52)
    expect(await count('sessions')).toBe(2);
    const meA = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${tokenA}` } }), testEnv);
    const meB = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${tokenB}` } }), testEnv);
    expect(meA.status).toBe(401); // 이전 기기: 새 로그인으로 즉시 거부
    expect(meB.status).toBe(200); // 새 로그인 기기: 정상
    const bodyB = (await meB.json()) as { user: { id: string } };
    expect(bodyB.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await countActiveSessions()).toBe(1);
    expect(await countRevokedSessions()).toBe(1);
    // 새 로그인 사용자는 이전 세션의 사용자와 동일하다(동일 sub 재로그인)
    const identityRepo = createD1UserIdentityRepository(db);
    const identity = await identityRepo.findIdentity({ provider: 'kakao', subject: FAKE_SUB });
    expect(identity?.userId).toBe(bodyB.user.id);
  });

  it('AC(#52 단일 활성): 이전 기기 토큰은 보호 API 전반에서 401이다', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const oldToken = await performLogin(app, testEnv);
    const newToken = await performLogin(app, testEnv);

    const me = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${oldToken}` } }), testEnv);
    const logout = await app.fetch(
      new Request('https://moi.test/auth/logout', {
        method: 'POST',
        headers: { cookie: `__Host-moi_session=${oldToken}`, origin: 'https://moi.test', 'sec-fetch-site': 'same-origin' },
      }),
      testEnv,
    );
    expect(me.status).toBe(401);
    expect(logout.status).toBe(401);
    expect((await countActiveSessions())).toBe(1); // 새 세션만 유지
    const meNew = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${newToken}` } }), testEnv);
    expect(meNew.status).toBe(200);
  });

  it('AC(#52 독립성): 서로 다른 사용자의 세션은 서로 영향을 주지 않는다', async () => {
    const testEnv = envWithKeys({ v1: KEY_V1 });
    const app = createAppWithSpy();
    const tokenA = await performLogin(app, testEnv);
    const tokenB = await performLogin(app, testEnv, 'other-kakao-sub-5678');

    const meA = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${tokenA}` } }), testEnv);
    const meB = await app.fetch(new Request('https://moi.test/api/me', { headers: { cookie: `__Host-moi_session=${tokenB}` } }), testEnv);
    expect(meA.status).toBe(200);
    expect(meB.status).toBe(200);
    const bodyA = (await meA.json()) as { user: { id: string } };
    const bodyB = (await meB.json()) as { user: { id: string } };
    expect(bodyA.user.id).not.toBe(bodyB.user.id);
    expect(await count('sessions')).toBe(2);
    expect(await countActiveSessions()).toBe(2); // 사용자당 각 1개씩 독립 활성
  });

  it('AC(#52 경합): 같은 사용자 세션을 동시에 활성화해도 활성은 최대 1개다', async () => {
    const repo = createD1SessionRepository(db);
    const userId = crypto.randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);
    await db
      .prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)')
      .bind(userId, nowSec, nowSec)
      .run();

    await Promise.all([
      repo.activate({ jti: 'race-jti-1', userId, issuedAt: nowSec, expiresAt: nowSec + 3600 }),
      repo.activate({ jti: 'race-jti-2', userId, issuedAt: nowSec + 1, expiresAt: nowSec + 3600 }),
      repo.activate({ jti: 'race-jti-3', userId, issuedAt: nowSec + 2, expiresAt: nowSec + 3600 }),
    ]);

    const active = await db
      .prepare('SELECT count(*) AS c FROM sessions WHERE user_id = ?1 AND revoked_at IS NULL')
      .bind(userId)
      .first<{ c: number }>();
    expect(active?.c).toBe(1); // 활성 최대 1개
    expect(await count('sessions')).toBe(3); // 실패한 활성화도 이력으로 남는다
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
