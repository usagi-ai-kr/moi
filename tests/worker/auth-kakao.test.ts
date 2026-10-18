import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebCryptoOAuthCrypto } from '@/infra/auth/kakao/crypto';
import { createKakaoAuthRuntime } from '@/infra/auth/kakao/runtime';
import { createApp } from '@/infra/http/app';
import type { OAuthIdentity } from '@/domain/auth/identity';
import migrationSql from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import {
  applyD1Migrations,
  createFakeKakaoServer,
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_REDIRECT_URI,
  FAKE_SUB,
  nowEpochSeconds,
  type FakeKakaoServer,
} from './fixtures/kakao-fakes';

// Worker+D1 통합 테스트 — 실제 카카오는 사용하지 않고 URL별 fake(token/JWKS)로 stub한다(ADR-0007).
// 각 테스트는 BDD Given/When/Then 주석으로 이슈 #2 AC와 매핑된다.

const testEnv: Env = {
  ...env,
  KAKAO_CLIENT_ID: FAKE_CLIENT_ID,
  KAKAO_CLIENT_SECRET: FAKE_CLIENT_SECRET,
  KAKAO_REDIRECT_URI: FAKE_REDIRECT_URI,
};

const cryptoPort = createWebCryptoOAuthCrypto();

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
  await applyD1Migrations(testEnv.DB, [migrationSql]);
});

beforeEach(async () => {
  await testEnv.DB.prepare('DELETE FROM oauth_states').run();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function startLogin(app: ReturnType<typeof createApp>) {
  const res = await app.fetch(new Request('https://moi.test/auth/kakao'), testEnv);
  expect(res.status).toBe(302);
  const locationHeader = res.headers.get('location');
  expect(locationHeader).not.toBeNull();
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/__Host-moi_oauth=([^;]+)/);
  expect(match).not.toBeNull();
  return {
    res,
    location: new URL(locationHeader as string),
    setCookie,
    state: new URL(locationHeader as string).searchParams.get('state') ?? '',
    binding: match?.[1] ?? '',
  };
}

interface StateRow {
  state_hash: string;
  browser_binding_hash: string;
  nonce: string;
  pkce_verifier: string;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
}

async function readStateRow(db: D1Database, stateHash: string): Promise<StateRow | null> {
  return db
    .prepare(
      'SELECT state_hash, browser_binding_hash, nonce, pkce_verifier, created_at, expires_at, consumed_at FROM oauth_states WHERE state_hash = ?1',
    )
    .bind(stateHash)
    .first<StateRow>();
}

/** 로그인 시작 → DB 행 확인 → 유효한 ID token으로 fake 토큰 응답 구성. */
async function arrangeValidCallback(fake: FakeKakaoServer, app: ReturnType<typeof createApp>) {
  const started = await startLogin(app);
  const stateHash = await cryptoPort.sha256Hex(started.state);
  const row = await readStateRow(testEnv.DB, stateHash);
  expect(row).not.toBeNull();
  const now = nowEpochSeconds();
  const idToken = await fake.signIdToken({
    iss: 'https://kauth.kakao.com',
    aud: FAKE_CLIENT_ID,
    sub: FAKE_SUB,
    iat: now,
    exp: now + 600,
    nonce: (row as StateRow).nonce,
  });
  fake.setTokenResponse({
    status: 200,
    body: JSON.stringify({ access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600, id_token: idToken }),
  });
  return { ...started, row: row as StateRow, idToken };
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

describe('GET /auth/kakao (로그인 시작)', () => {
  it('AC1 전제: 302·인가 파라미터·쿠키 속성·해시 저장·TTL 600을 만족한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();

    const started = await startLogin(app);

    // 인가 URL 파라미터
    const q = started.location.searchParams;
    expect(started.location.origin + started.location.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
    expect(q.get('client_id')).toBe(FAKE_CLIENT_ID);
    expect(q.get('redirect_uri')).toBe(FAKE_REDIRECT_URI);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('state') ?? '').toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('nonce') ?? '').toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('code_challenge') ?? '').toMatch(/^[A-Za-z0-9_-]{43}$/);

    // 브라우저 한정 임시 쿠키 속성 (__Host-, Secure, HttpOnly, SameSite=Lax, Path=/, Domain 없음, Max-Age=600)
    expect(started.setCookie).toContain('__Host-moi_oauth=');
    expect(started.setCookie).toContain('Max-Age=600');
    expect(started.setCookie).toContain('Path=/');
    expect(started.setCookie).toContain('Secure');
    expect(started.setCookie).toContain('HttpOnly');
    expect(started.setCookie).toContain('SameSite=Lax');
    expect(started.setCookie.toLowerCase()).not.toContain('domain=');
    expect(started.res.headers.get('cache-control')).toBe('no-store');

    // DB에는 raw state가 아닌 해시가 저장된다 + TTL 600
    const row = await readStateRow(testEnv.DB, await cryptoPort.sha256Hex(started.state));
    expect(row).not.toBeNull();
    expect((row as StateRow).state_hash).not.toBe(started.state);
    expect((row as StateRow).browser_binding_hash).toBe(await cryptoPort.sha256Hex(started.binding));
    expect((row as StateRow).expires_at - (row as StateRow).created_at).toBe(600);
    expect((row as StateRow).consumed_at).toBeNull();
  });
});

describe('GET /auth/kakao/callback (AC1 정상 경로)', () => {
  it('AC1: Given 올바른 code/state/서명된 ID token When callback Then 200이고 검증된 provider=kakao, sub를 얻는다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app);

    const res = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    // 모든 콜백 응답에서 임시 쿠키를 삭제한다(Max-Age=0)
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('__Host-moi_oauth=');
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(capture.identity).toEqual({ provider: 'kakao', sub: FAKE_SUB });

    // 성공 응답 본문에 토큰·sub·코드 원문이 없다
    const body = await res.text();
    expect(body.includes(FAKE_SUB)).toBe(false);
    expect(body.includes(arranged.idToken)).toBe(false);
    expect(body.includes('fake-access-token')).toBe(false);
    expect(body.includes(arranged.state)).toBe(false);

    // 토큰 교환: code_verifier가 저장된 verifier와 일치(S256(challenge) = 인가 요청 challenge)
    expect(fake.tokenRequests).toHaveLength(1);
    const tokenReq = fake.tokenRequests[0];
    expect(tokenReq.get('grant_type')).toBe('authorization_code');
    expect(tokenReq.get('client_id')).toBe(FAKE_CLIENT_ID);
    expect(tokenReq.get('client_secret')).toBe(FAKE_CLIENT_SECRET);
    expect(tokenReq.get('redirect_uri')).toBe(FAKE_REDIRECT_URI);
    expect(tokenReq.get('code')).toBe('auth-code-123');
    expect(tokenReq.get('code_verifier')).toBe(arranged.row.pkce_verifier);
    expect(await cryptoPort.pkceS256Challenge(arranged.row.pkce_verifier)).toBe(
      arranged.location.searchParams.get('code_challenge'),
    );

    // 성공 경로에서도 소비 완료(재사용 불가)
    const after = await readStateRow(testEnv.DB, await cryptoPort.sha256Hex(arranged.state));
    expect((after as StateRow).consumed_at).not.toBeNull();
  });
});

describe('GET /auth/kakao/callback (AC2 state 검증)', () => {
  it('AC2: Given 재사용된 state(이중 콜백) When callback Then 거부한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app);
    const first = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);
    expect(first.status).toBe(200);

    const second = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);

    expect(second.status).toBe(400);
    expect(second.headers.get('cache-control')).toBe('no-store');
  });

  it('부가: 잘못된 Zod payload(빈 state 쿼리)는 거부한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();

    const res = await app.fetch(
      new Request('https://moi.test/auth/kakao/callback?code=abc&state='),
      testEnv,
    );

    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fake.tokenRequests).toHaveLength(0);
  });

  it('AC2: Given 잘못된 state When callback Then 거부한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    await startLogin(app); // 다른 state가 저장되어 있음

    const badState = 'a'.repeat(43);
    const res = await app.fetch(callbackRequest(badState), testEnv);

    expect(res.status).toBe(400);
  });

  it('AC2: Given 만료된 state When callback Then 거부한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const started = await startLogin(app);
    const stateHash = await cryptoPort.sha256Hex(started.state);
    await testEnv.DB.prepare('UPDATE oauth_states SET expires_at = ?1 WHERE state_hash = ?2').bind(
      nowEpochSeconds() - 1,
      stateHash,
    ).run();

    const res = await app.fetch(callbackRequest(started.state, { binding: started.binding }), testEnv);

    expect(res.status).toBe(400);
  });
});

describe('GET /auth/kakao/callback (바인딩·취소·PKCE)', () => {
  it('부가: 타 브라우저 바인딩 불일치는 거부하고 state는 소비된다 — 이후 정상 쿠키로도 재사용 불가', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app);

    const mismatch = await app.fetch(
      callbackRequest(arranged.state, { binding: 'other-browser-binding-token' }),
      testEnv,
    );
    expect(mismatch.status).toBe(400);
    // fail-closed: 소비는 쿠키 확인 전에 일어났다
    const afterMismatch = await readStateRow(testEnv.DB, await cryptoPort.sha256Hex(arranged.state));
    expect((afterMismatch as StateRow).consumed_at).not.toBeNull();

    const retryWithCorrectCookie = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);
    expect(retryWithCorrectCookie.status).toBe(400);
    expect(fake.tokenRequests).toHaveLength(0); // 코드 교환 자체가 일어나지 않는다
  });

  it('부가: 쿠키 없는 콜백은 거부한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app);

    const res = await app.fetch(callbackRequest(arranged.state, { binding: null }), testEnv);

    expect(res.status).toBe(400);
  });

  it('AC4: Given 사용자 동의 취소(error=access_denied) When callback Then 공통 실패(400)로 수렴하고 state는 소비된다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app);

    const res = await app.fetch(
      callbackRequest(arranged.state, { code: null, error: 'access_denied', binding: arranged.binding }),
      testEnv,
    );

    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    // 실패 응답에서도 임시 쿠키를 삭제한다(Max-Age=0)
    const deniedCookie = res.headers.get('set-cookie') ?? '';
    expect(deniedCookie).toContain('__Host-moi_oauth=');
    expect(deniedCookie).toContain('Max-Age=0');
    const body = await res.text();
    expect(body.includes('access_denied')).toBe(false); // 내부 오류 코드 미노출
    const after = await readStateRow(testEnv.DB, await cryptoPort.sha256Hex(arranged.state));
    expect((after as StateRow).consumed_at).not.toBeNull();
  });

  it('부가: PKCE verifier 불일치(upstream이 코드 교환 거절)는 502로 수렴한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app);
    // DB의 verifier를 변조해 코드 교환 시 verifier 불일치를 유발한다
    await testEnv.DB.prepare('UPDATE oauth_states SET pkce_verifier = ?1 WHERE state_hash = ?2')
      .bind('tampered-verifier-value-0123456789012345678901234567890123456789', await cryptoPort.sha256Hex(arranged.state))
      .run();
    fake.setRequireCodeVerifier(arranged.row.pkce_verifier); // 일치할 때만 200

    const res = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);

    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(capture.identity).toBeNull();
  });
});

describe('GET /auth/kakao/callback (AC3 OIDC 검증·upstream 장애)', () => {
  it('AC3: nonce 불일치 ID token은 거부한다(502)', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const started = await startLogin(app);
    const now = nowEpochSeconds();
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

    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    // 검증 실패 응답에서도 임시 쿠키를 삭제한다(Max-Age=0)
    const failedCookie = res.headers.get('set-cookie') ?? '';
    expect(failedCookie).toContain('__Host-moi_oauth=');
    expect(failedCookie).toContain('Max-Age=0');
    expect(capture.identity).toBeNull();
  });

  it('AC3: 서명 실패(JWKS에 없는 키로 서명된 토큰)는 거부한다(502)', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const started = await startLogin(app);
    const row = await readStateRow(testEnv.DB, await cryptoPort.sha256Hex(started.state));
    const now = nowEpochSeconds();
    // kid-1만 실어 보내는 JWKS, kid-2 키로 서명 → kid 미스 → 쿨다운 내라 재조회 없이 거부
    fake.setJwksResponses([{ status: 200, body: JSON.stringify({ keys: [fake.keys[0].jwk] }) }]);
    const idToken = await fake.signIdToken(
      { iss: 'https://kauth.kakao.com', aud: FAKE_CLIENT_ID, sub: FAKE_SUB, iat: now, exp: now + 600, nonce: (row as StateRow).nonce },
      { kid: 'kid-2', keyIndex: 1 },
    );
    fake.setTokenResponse({ status: 200, body: JSON.stringify({ access_token: 'a', token_type: 'bearer', expires_in: 1, id_token: idToken }) });

    const res = await app.fetch(callbackRequest(started.state, { binding: started.binding }), testEnv);

    expect(res.status).toBe(502);
    expect(capture.identity).toBeNull();
  });

  it('부가: upstream 네트워크 오류(토큰 교환)는 502로 수렴한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app);
    fake.setTokenResponse('network-error');

    const res = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);

    expect(res.status).toBe(502);
    expect(capture.identity).toBeNull();
  });

  it('부가: 비정상 token JSON은 502로 수렴한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app);
    fake.setTokenResponse({ status: 200, body: 'not-json' });

    const res = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);

    expect(res.status).toBe(502);
  });

  it('부가: 잘못된 JWKS 응답은 502로 수렴한다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const arranged = await arrangeValidCallback(fake, app);
    fake.setJwksResponses([{ status: 200, body: 'garbage-jwks' }]);

    const res = await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);

    expect(res.status).toBe(502);
    expect(capture.identity).toBeNull();
  });
});

describe('로그 redaction (ADR-0006)', () => {
  it('성공·실패 경로의 콘솔 로그에 code/state/nonce/id_token/access_token/client_secret/sub 원문이 없다', async () => {
    const fake = await createFakeKakaoServer();
    vi.stubGlobal('fetch', fake.fetch);
    const app = createAppWithSpy();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let lines: string[] = [];
    try {
      // 성공 경로
      const arranged = await arrangeValidCallback(fake, app);
      await app.fetch(callbackRequest(arranged.state, { binding: arranged.binding }), testEnv);
      // 실패 경로(바인딩 불일치)
      const failed = await startLogin(app);
      await app.fetch(callbackRequest(failed.state, { binding: 'wrong-binding' }), testEnv);

      const logLines = logSpy.mock.calls.map((call) => String(call[0]));
      expect(logLines.length).toBeGreaterThan(0);
      const all = logLines.join('\n');

      // 허용 필드(level/msg/requestId/outcome)만 출력된다
      for (const line of logLines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        for (const key of Object.keys(parsed)) {
          expect(['level', 'msg', 'requestId', 'outcome']).toContain(key);
        }
      }
      // 원문 미출력
      for (const secret of [
        'auth-code-123',
        arranged.state,
        arranged.binding,
        arranged.row.nonce,
        arranged.row.pkce_verifier,
        arranged.idToken,
        'fake-access-token',
        FAKE_CLIENT_SECRET,
        FAKE_SUB,
        failed.state,
        failed.binding,
      ]) {
        expect(all.includes(secret)).toBe(false);
      }
      lines = logLines;
    } finally {
      logSpy.mockRestore();
    }
    // 캡처된 로그 원문을 증거로 출력(스크립트 redaction 검사 입력용 — 화이트리스트 필드만 포함)
    console.log(`REDACTION_EVIDENCE:${JSON.stringify(lines)}`);
  });
});
