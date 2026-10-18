import { SignJWT, exportJWK } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKakaoOidcVerifier } from '@/infra/auth/kakao/kakao-oidc-verifier';

// OIDC 검증기 단위 테스트 — valid / nonce·iss·aud 불일치 / exp 만료 / iat 미래 / alg none·HS256 /
// 서명 변조 / 빈 sub / malformed JWKS / unknown kid→쿨다운 경과 후 JWKS 1회 재조회 (스킬: kakao-oidc-auth).
// RS256 키는 WebCrypto로 생성하고 JWT는 jose로 서명한다. 실제 카카오 미사용(전역 fetch stub).

const JWKS_URL = 'https://kauth.kakao.com/.well-known/jwks.json';
const CLIENT_ID = 'test-rest-api-key';
const FIXED_NOW = 1_800_000_000; // epoch seconds

async function createRs256Key(kid: string) {
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const { publicKey, privateKey } = keyPair;
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { privateKey, jwk };
}

async function signIdToken(
  privateKey: CryptoKey,
  kid: string,
  payload: Record<string, unknown>,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid })
    .sign(privateKey);
}

interface JwksFetchRecorder {
  calls: string[];
  set: (url: string, bodies: Array<string | { status: number }>) => void;
  stub: () => void;
}

function createJwksFetchRecorder(): JwksFetchRecorder {
  const responses = new Map<string, Array<string | { status: number }>>();
  const calls: string[] = [];
  return {
    calls,
    // 같은 URL에 순차 응답을 등록한다. 마지막 응답은 반복 사용된다.
    set: (url, bodies) => responses.set(url, bodies),
    stub: () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          calls.push(url);
          const queue = responses.get(url);
          if (queue === undefined || queue.length === 0) return new Response('not found', { status: 404 });
          const body = queue.length === 1 ? queue[0] : (queue.shift() as string | { status: number });
          if (typeof body === 'object') return new Response('boom', { status: body.status });
          return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
        }),
      );
    },
  };
}

let recorder: JwksFetchRecorder;

beforeEach(() => {
  recorder = createJwksFetchRecorder();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Kakao OIDC 검증기 (jose + JWKS)', () => {
  it('유효한 RS256 ID token이면 provider=kakao와 sub를 반환한다', async () => {
    const { privateKey, jwk } = await createRs256Key('kid-1');
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [jwk] })]);
    recorder.stub();

    const idToken = await signIdToken(privateKey, 'kid-1', {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    });
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).resolves.toEqual({
      provider: 'kakao',
      sub: '1234567890',
    });
  });

  it('nonce가 일치하지 않으면 거부한다', async () => {
    const { privateKey, jwk } = await createRs256Key('kid-1');
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [jwk] })]);
    recorder.stub();
    const idToken = await signIdToken(privateKey, 'kid-1', {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'attacker-nonce',
    });
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('issuer가 불일치하면 거부한다', async () => {
    const { privateKey, jwk } = await createRs256Key('kid-1');
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [jwk] })]);
    recorder.stub();
    const idToken = await signIdToken(privateKey, 'kid-1', {
      iss: 'https://evil.example.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    });
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('audience가 불일치하면 거부한다', async () => {
    const { privateKey, jwk } = await createRs256Key('kid-1');
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [jwk] })]);
    recorder.stub();
    const idToken = await signIdToken(privateKey, 'kid-1', {
      iss: 'https://kauth.kakao.com',
      aud: 'another-client-id',
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    });
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('만료된 토큰(clockTolerance 60초 이상 경과)은 거부한다', async () => {
    const { privateKey, jwk } = await createRs256Key('kid-1');
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [jwk] })]);
    recorder.stub();
    const idToken = await signIdToken(privateKey, 'kid-1', {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW - 7200,
      exp: FIXED_NOW - 3600,
      nonce: 'nonce-value',
    });
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('iat가 허용 오차(60초)보다 미래면 거부한다', async () => {
    const { privateKey, jwk } = await createRs256Key('kid-1');
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [jwk] })]);
    recorder.stub();
    const idToken = await signIdToken(privateKey, 'kid-1', {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW + 3600,
      exp: FIXED_NOW + 7200,
      nonce: 'nonce-value',
    });
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('alg=none(서명 없음) 토큰은 거부한다', async () => {
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [] })]);
    recorder.stub();
    const encode = (obj: unknown) =>
      btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const idToken = `${encode({ alg: 'none' })}.${encode({
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    })}.`;
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('alg=HS256 토큰은 허용 알고리즘이 아니어서 거부한다', async () => {
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [] })]);
    recorder.stub();
    const secret = new TextEncoder().encode('attacker-shared-secret');
    const idToken = await new SignJWT({
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('서명이 변조된 토큰은 거부한다', async () => {
    const { privateKey, jwk } = await createRs256Key('kid-1');
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [jwk] })]);
    recorder.stub();
    const legit = await signIdToken(privateKey, 'kid-1', {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    });
    const tampered = legit.slice(0, -2) + (legit.endsWith('AA') ? 'BB' : 'AA');
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken: tampered, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('sub가 빈 문자열이면 거부한다', async () => {
    const { privateKey, jwk } = await createRs256Key('kid-1');
    recorder.set(JWKS_URL, [JSON.stringify({ keys: [jwk] })]);
    recorder.stub();
    const idToken = await signIdToken(privateKey, 'kid-1', {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    });
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('malformed JWKS 응답은 거부한다', async () => {
    const { privateKey } = await createRs256Key('kid-1');
    recorder.set(JWKS_URL, ['this is not json']);
    recorder.stub();
    const idToken = await signIdToken(privateKey, 'kid-1', {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    });
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
  });

  it('unknown kid는 쿨다운(30초) 경과 후 JWKS 1회 재조회로 검증에 성공하고, 재조회 직후 반복 시도는 재조회하지 않는다', async () => {
    const { privateKey, jwk } = await createRs256Key('kid-rotated');
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000);
    // 1차 응답: 회전 전 JWKS(대상 kid 없음) → 2차 응답: 새 kid 포함(회전 완료).
    recorder.set(JWKS_URL, [
      JSON.stringify({ keys: [{ kid: 'kid-old', kty: 'RSA', n: 'x', e: 'AQAB', alg: 'RS256', use: 'sig' }] }),
      JSON.stringify({ keys: [jwk] }),
    ]);
    recorder.stub();
    const idToken = await signIdToken(privateKey, 'kid-rotated', {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    });
    const verifier = createKakaoOidcVerifier({ clientId: CLIENT_ID, now: () => FIXED_NOW });

    // 첫 검증: 캐시가 식지 않아(cooldown 30초) 바로 재조회하지 않고 거부한다
    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).rejects.toThrow();
    expect(recorder.calls).toHaveLength(1);

    // 쿨다운 경과 후 재검증: JWKS를 1회 재조회해 검증에 성공한다
    nowSpy.mockReturnValue(1_000_031_000);
    await expect(verifier.verify({ idToken, nonce: 'nonce-value' })).resolves.toEqual({
      provider: 'kakao',
      sub: '1234567890',
    });
    expect(recorder.calls).toHaveLength(2);
    expect(recorder.calls[0]).toBe(JWKS_URL);
    expect(recorder.calls[1]).toBe(JWKS_URL);

    // 재조회 직후 또 다른 unknown kid(무제한 재조회 방지): 쿨다운 내 재조회 없이 거부한다
    const anotherUnknownKid = await signIdToken(privateKey, 'kid-never-published', {
      iss: 'https://kauth.kakao.com',
      aud: CLIENT_ID,
      sub: '1234567890',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 600,
      nonce: 'nonce-value',
    });
    nowSpy.mockReturnValue(1_000_032_000);
    await expect(verifier.verify({ idToken: anotherUnknownKid, nonce: 'nonce-value' })).rejects.toThrow();
    expect(recorder.calls).toHaveLength(2);

    nowSpy.mockRestore();
  });
});
