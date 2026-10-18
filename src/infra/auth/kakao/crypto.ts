import type { OAuthCrypto } from '@/app/auth/ports';

/**
 * WebCrypto 기반 OAuthCrypto 어댑터 (Workers/Node 공통).
 * - randomToken: CSPRNG → base64url(패딩 없음). 32B=43자, 64B=86자.
 * - sha256Hex: state/browser binding 저장용 해시.
 * - pkceS256Challenge: PKCE S256 = base64url(SHA-256(verifier)).
 */
export function createWebCryptoOAuthCrypto(): OAuthCrypto {
  const toBase64Url = (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const toHex = (buffer: ArrayBuffer): string =>
    Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  return {
    randomToken(byteLength: number): string {
      const bytes = new Uint8Array(byteLength);
      crypto.getRandomValues(bytes);
      return toBase64Url(bytes);
    },
    async sha256Hex(value: string): Promise<string> {
      return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    },
    async pkceS256Challenge(verifier: string): Promise<string> {
      return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    },
  };
}
