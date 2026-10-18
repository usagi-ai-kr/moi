import { describe, expect, it } from 'vitest';
import type { AuthEventLogger, ConsumedOAuthState, OAuthCrypto, OAuthStateRepository } from '@/app/auth/ports';
import { completeKakaoLogin, type CompleteKakaoLoginDeps } from '@/app/auth/complete-kakao-login';
import { startKakaoLogin, type StartKakaoLoginConfig, type StartKakaoLoginDeps } from '@/app/auth/start-kakao-login';

// Start/Complete use case 단위 테스트 — fake port로 상태 소비 순서(fail-closed)·바인딩·
// 거부 사유·원문 미로그를 검증한다 (스킬: kakao-oidc-auth).
const CONFIG: StartKakaoLoginConfig = {
  clientId: 'test-rest-api-key',
  redirectUri: 'https://moi.test/auth/kakao/callback',
  authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
  ttlSeconds: 600,
};

interface FakePorts {
  crypto: OAuthCrypto;
  logger: AuthEventLogger;
  stateRepo: OAuthStateRepository;
  stateRepoCalls: {
    created: Array<{
      record: { stateHash: string; browserBindingHash: string; nonce: string; pkceVerifier: string };
      expiresAt: number;
      now: number;
    }>;
    consumed: Array<{ stateHash: string; now: number }>;
  };
  tokenClientCalls: Array<{ code: string; codeVerifier: string }>;
  verifierCalls: Array<{ idToken: string; nonce: string }>;
  randomTokens: string[];
}

function createFakePorts(options?: {
  consumeResult?: ConsumedOAuthState | null;
}): FakePorts {
  const randomTokens: string[] = [];
  let counter = 0;
  const crypto: OAuthCrypto = {
    randomToken(byteLength: number) {
      counter += 1;
      const value = `raw-token-${counter}-${'x'.repeat(Math.max(0, byteLength - 12))}`;
      randomTokens.push(value);
      return value;
    },
    async sha256Hex(value: string) {
      return `hash(${value})`;
    },
    async pkceS256Challenge(verifier: string) {
      return `challenge(${verifier})`;
    },
  };
  const logger: AuthEventLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  const consumedRow: ConsumedOAuthState = {
    stateHash: 'hash(raw-token-1-xxx)',
    browserBindingHash: 'hash(raw-token-4-xxx)',
    nonce: 'raw-token-2-xxx',
    pkceVerifier: 'raw-token-3-xxx',
  };
  const stateRepoCalls: FakePorts['stateRepoCalls'] = { created: [], consumed: [] };
  const stateRepo: OAuthStateRepository = {
    async create(input) {
      stateRepoCalls.created.push(input);
    },
    async consume(input) {
      stateRepoCalls.consumed.push(input);
      return options?.consumeResult !== undefined ? options.consumeResult : consumedRow;
    },
  };
  return {
    crypto,
    logger,
    stateRepo,
    stateRepoCalls,
    tokenClientCalls: [],
    verifierCalls: [],
    randomTokens,
  };
}

function startDeps(p: FakePorts): StartKakaoLoginDeps {
  return { stateRepo: p.stateRepo, crypto: p.crypto, logger: p.logger, config: CONFIG };
}

function completeDeps(
  p: FakePorts,
  options?: { exchangeError?: boolean; verifyError?: boolean; verifiedSub?: string },
): CompleteKakaoLoginDeps {
  return {
    stateRepo: p.stateRepo,
    tokenClient: {
      async exchangeAuthorizationCode(input) {
        if (options?.exchangeError) throw new Error('upstream down');
        p.tokenClientCalls.push(input);
        return { idToken: 'raw-id-token' };
      },
    },
    oidcVerifier: {
      async verify(input) {
        if (options?.verifyError) throw new Error('verification rejected');
        p.verifierCalls.push(input);
        return { provider: 'kakao' as const, sub: options?.verifiedSub ?? '1234567890' };
      },
    },
    crypto: p.crypto,
    logger: p.logger,
  };
}

describe('StartKakaoLogin use case', () => {
  it('state/nonce/verifier/binding을 생성하고 해시만 저장한다', async () => {
    const p = createFakePorts();

    const result = await startKakaoLogin(startDeps(p), { now: 1000 });

    expect(p.stateRepoCalls.created).toHaveLength(1);
    const stored = p.stateRepoCalls.created[0];
    const record = stored.record;
    // 원문이 아닌 SHA-256 hex 해시가 저장된다
    expect(record.stateHash).toBe(`hash(${p.randomTokens[0]})`);
    expect(record.stateHash.startsWith('hash(')).toBe(true);
    expect(record.browserBindingHash).toBe(`hash(${p.randomTokens[3]})`);
    // nonce/pkce_verifier는 검증·교환용으로 서버가 보관한다
    expect(record.nonce).toBe(p.randomTokens[1]);
    expect(record.pkceVerifier).toBe(p.randomTokens[2]);
    expect(stored.expiresAt).toBe(1600); // now + TTL 600
    expect(stored.now).toBe(1000);

    // 인가 URL: code_challenge S256·state·nonce 포함
    const url = new URL(result.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('test-rest-api-key');
    expect(url.searchParams.get('redirect_uri')).toBe('https://moi.test/auth/kakao/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(`challenge(${p.randomTokens[2]})`);
    expect(url.searchParams.get('state')).toBe(p.randomTokens[0]);
    expect(url.searchParams.get('nonce')).toBe(p.randomTokens[1]);

    // 바인딩 토큰은 쿠키용으로 반환되고(원문), 저장값은 해시다
    expect(result.browserBindingToken).toBe(p.randomTokens[3]);
    expect(result.cookieMaxAge).toBe(600);
  });

  it('state/nonce/verifier/binding 원문은 로그에 남지 않는다', async () => {
    const p = createFakePorts();
    const events: string[] = [];
    const logger: AuthEventLogger = {
      info: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      warn: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      error: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    };

    await startKakaoLogin({ ...startDeps(p), logger }, { now: 1000 });

    const serialized = events.join('\n');
    for (const raw of p.randomTokens) {
      expect(serialized.includes(raw)).toBe(false);
    }
  });
});

describe('CompleteKakaoLogin use case', () => {
  function baseInput() {
    return {
      code: 'auth-code-raw',
      state: 'raw-token-1-xxx',
      browserBindingToken: 'raw-token-4-xxx',
      now: 1000,
    };
  }

  it('AC1: 정상 경로에서 검증된 provider=kakao, sub를 반환하고 소비가 선행한다', async () => {
    const p = createFakePorts();

    const result = await completeKakaoLogin(completeDeps(p), baseInput());

    expect(result).toEqual({ outcome: 'success', identity: { provider: 'kakao', sub: '1234567890' } });
    // fail-closed: 쿠키·오류 파라미터 확인 전에 소비가 먼저 일어난다
    expect(p.stateRepoCalls.consumed).toEqual([{ stateHash: 'hash(raw-token-1-xxx)', now: 1000 }]);
    expect(p.tokenClientCalls).toEqual([{ code: 'auth-code-raw', codeVerifier: 'raw-token-3-xxx' }]);
    expect(p.verifierCalls).toEqual([{ idToken: 'raw-id-token', nonce: 'raw-token-2-xxx' }]);
  });

  it('AC2: state가 없으면 소비 없이 거부한다', async () => {
    const p = createFakePorts();

    const result = await completeKakaoLogin(completeDeps(p), { ...baseInput(), state: undefined });

    expect(result).toEqual({ outcome: 'rejected', reason: 'invalid_state' });
    expect(p.stateRepoCalls.consumed).toHaveLength(0);
  });

  it('AC2: 재사용/만료 state(소비 결과 null)는 거부한다', async () => {
    const p = createFakePorts({ consumeResult: null });

    const result = await completeKakaoLogin(completeDeps(p), baseInput());

    expect(result).toEqual({ outcome: 'rejected', reason: 'invalid_state' });
    expect(p.tokenClientCalls).toHaveLength(0);
  });

  it('AC2/AC4: error 파라미터(동의 취소)는 소비 후 거부한다 — 재사용 불가', async () => {
    const p = createFakePorts();

    const result = await completeKakaoLogin(completeDeps(p), { ...baseInput(), code: undefined, error: 'access_denied' });

    expect(result).toEqual({ outcome: 'rejected', reason: 'user_cancelled' });
    expect(p.stateRepoCalls.consumed).toHaveLength(1); // 소비 선행(fail-closed)
    expect(p.tokenClientCalls).toHaveLength(0);
  });

  it('부가: 브라우저 바인딩 불일치는 소비 후 거부한다', async () => {
    const p = createFakePorts();

    const result = await completeKakaoLogin(completeDeps(p), { ...baseInput(), browserBindingToken: 'other-browser-token' });

    expect(result).toEqual({ outcome: 'rejected', reason: 'browser_binding_mismatch' });
    expect(p.stateRepoCalls.consumed).toHaveLength(1);
    expect(p.tokenClientCalls).toHaveLength(0);
  });

  it('부가: 쿠키가 없으면 거부한다', async () => {
    const p = createFakePorts();

    const result = await completeKakaoLogin(completeDeps(p), { ...baseInput(), browserBindingToken: null });

    expect(result).toEqual({ outcome: 'rejected', reason: 'browser_binding_mismatch' });
  });

  it('부가: 토큰 교환 실패는 token_exchange_failed로 거부한다', async () => {
    const p = createFakePorts();

    const result = await completeKakaoLogin(completeDeps(p, { exchangeError: true }), baseInput());

    expect(result).toEqual({ outcome: 'rejected', reason: 'token_exchange_failed' });
    expect(p.verifierCalls).toHaveLength(0);
  });

  it('부가: OIDC 검증 실패는 oidc_verification_failed로 거부한다', async () => {
    const p = createFakePorts();

    const result = await completeKakaoLogin(completeDeps(p, { verifyError: true }), baseInput());

    expect(result).toEqual({ outcome: 'rejected', reason: 'oidc_verification_failed' });
  });

  it('거부 시에도 code/state/nonce/token/sub 원문은 로그에 남지 않는다', async () => {
    const p = createFakePorts();
    const events: string[] = [];
    const logger: AuthEventLogger = {
      info: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      warn: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      error: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    };

    await completeKakaoLogin({ ...completeDeps(p, { verifyError: true }), logger }, baseInput());

    const serialized = events.join('\n');
    for (const raw of ['auth-code-raw', 'raw-token-1-xxx', 'raw-token-4-xxx', 'raw-id-token', 'raw-token-2-xxx', 'raw-token-3-xxx', '1234567890']) {
      expect(serialized.includes(raw)).toBe(false);
    }
  });
});
