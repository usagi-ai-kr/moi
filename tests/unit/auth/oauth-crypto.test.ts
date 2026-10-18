import { describe, expect, it } from 'vitest';
import { createWebCryptoOAuthCrypto } from '@/infra/auth/kakao/crypto';

// PKCE S256 challenge/verifier, state/binding 해시 (스킬: kakao-oidc-auth — 단위)
const crypto = createWebCryptoOAuthCrypto();

describe('WebCrypto OAuthCrypto 어댑터', () => {
  describe('pkceS256Challenge — RFC 7636 부록 B 벡터', () => {
    it('공개 벡터에 대한 S256 challenge를 만든다', async () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      await expect(crypto.pkceS256Challenge(verifier)).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });

    it('challenge는 base64url(패딩 없음)이며 SHA-256 길이(43자)다', async () => {
      const challenge = await crypto.pkceS256Challenge('another-verifier-value-0123456789ABCDEFGH');
      expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('다른 verifier는 다른 challenge를 만든다', async () => {
      const a = await crypto.pkceS256Challenge('verifier-a');
      const b = await crypto.pkceS256Challenge('verifier-b');
      expect(a).not.toBe(b);
    });
  });

  describe('sha256Hex', () => {
    it('SHA-256 hex 해시를 만든다 (FIPS 벡터)', async () => {
      await expect(crypto.sha256Hex('abc')).resolves.toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('상태/바인딩 해시는 64자 hex이고 결정적이다', async () => {
      const a = await crypto.sha256Hex('state-or-binding-token');
      const b = await crypto.sha256Hex('state-or-binding-token');
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(a).toBe(b);
    });
  });

  describe('randomToken', () => {
    it('base64url 43자 (32바이트) 토큰을 만든다', () => {
      expect(crypto.randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('PKCE verifier 요구(43~128자 base64url)를 만족하는 64바이트 토큰을 만든다', () => {
      expect(crypto.randomToken(64)).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    });

    it('호출마다 다른 값을 만든다', () => {
      const seen = new Set(Array.from({ length: 50 }, () => crypto.randomToken(32)));
      expect(seen.size).toBe(50);
    });
  });
});
