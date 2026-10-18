import { SignJWT, exportJWK } from 'jose';

/**
 * Fake Kakao OIDC 서버 fixture — 실제 카카오 미사용(CI 원칙, ADR-0007).
 * 전역 fetch를 URL별로 stub한다: 토큰 교환(POST)·JWKS(GET).
 * RS256 키는 WebCrypto로 생성하고 JWT는 jose로 서명한다.
 */
export const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
export const JWKS_URL = 'https://kauth.kakao.com/.well-known/jwks.json';

export const FAKE_CLIENT_ID = 'test-kakao-rest-api-key';
export const FAKE_CLIENT_SECRET = 'test-kakao-client-secret';
export const FAKE_REDIRECT_URI = 'https://moi.test/auth/kakao/callback';
export const FAKE_SUB = 'test-kakao-sub-1234';

export interface FakeRs256Key {
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly jwk: Record<string, unknown>;
}

async function createRs256Key(kid: string): Promise<FakeRs256Key> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = { ...(await exportJWK(keyPair.publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { kid, privateKey: keyPair.privateKey, jwk };
}

type StaticResponse = { status: number; body: string } | 'network-error';

export interface FakeKakaoServer {
  fetch: typeof fetch;
  tokenRequests: Array<URLSearchParams>;
  setJwksResponses: (responses: Array<StaticResponse | 'current-jwks'>) => void;
  setTokenResponse: (response: StaticResponse) => void;
  /** 설정하면 code_verifier가 일치할 때만 200을 돌려준다(PKCE 불일치 시뮬레이션). */
  setRequireCodeVerifier: (expected: string | null) => void;
  signIdToken: (payload: Record<string, unknown>, options?: { kid?: string; keyIndex?: number }) => Promise<string>;
  keys: FakeRs256Key[];
}

export async function createFakeKakaoServer(): Promise<FakeKakaoServer> {
  const keys = await Promise.all([createRs256Key('kid-1'), createRs256Key('kid-2')]);
  const tokenRequests: Array<URLSearchParams> = [];

  let jwksResponses: Array<StaticResponse | 'current-jwks'> = ['current-jwks'];
  let jwksCursor = 0;
  let tokenResponse: StaticResponse = { status: 500, body: 'unconfigured' };
  let requireCodeVerifier: string | null = null;

  const jwksJson = () => JSON.stringify({ keys: keys.map((k) => k.jwk) });

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === TOKEN_URL) {
      const body = new URLSearchParams(String(init?.body ?? ''));
      tokenRequests.push(body);
      if (requireCodeVerifier !== null && body.get('code_verifier') !== requireCodeVerifier) {
        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE verification failed.' }), {
          status: 400,
        });
      }
      if (tokenResponse === 'network-error') throw new Error('simulated network failure');
      return new Response(tokenResponse.body, { status: tokenResponse.status });
    }
    if (url === JWKS_URL) {
      const response = jwksResponses[Math.min(jwksCursor, jwksResponses.length - 1)];
      jwksCursor += 1;
      if (response === 'network-error') throw new Error('simulated network failure');
      const body = response === 'current-jwks' ? jwksJson() : response.body;
      return new Response(body, {
        status: response === 'current-jwks' ? 200 : response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`fake kakao: unexpected url ${url}`);
  }) as typeof fetch;

  return {
    fetch: fakeFetch,
    tokenRequests,
    setJwksResponses: (responses) => {
      jwksResponses = responses;
      jwksCursor = 0;
    },
    setTokenResponse: (response) => {
      tokenResponse = response;
    },
    setRequireCodeVerifier: (expected) => {
      requireCodeVerifier = expected;
    },
    async signIdToken(payload, options) {
      const key = keys[options?.keyIndex ?? 0];
      return new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: options?.kid ?? key.kid })
        .sign(key.privateKey);
    },
    keys,
  };
}

export function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** drizzle 마이그레이션 SQL을 D1에 적용한다(D1 exec는 한 줄 파싱이라 정규화 필요). */
export async function applyD1Migrations(db: D1Database, migrationSqls: string[]): Promise<void> {
  for (const raw of migrationSqls) {
    const singleLine = raw.replace(/\s+/g, ' ').trim();
    for (const stmt of singleLine.split('--> statement-breakpoint')) {
      const s = stmt.trim().replace(/;+$/, '');
      if (s.length > 0) await db.exec(`${s};`);
    }
  }
}
