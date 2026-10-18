/**
 * 세션 단위 WebCrypto 보조 (이슈 #4, ADR-0005/0006).
 * - sha256Hex: D1 `sessions.jti_hash`용 (원문 jti/PASETO 저장 금지).
 * - base64 ↔ base64url 변환: Cloudflare Secrets 키 형식(put-paseto-key.sh: base64) ↔ paseto-ts PASERK(k4.local.).
 */
export function sha256Hex(value: string): Promise<string> {
  return crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(value))
    .then((buffer) => Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join(''));
}

export function base64Decode(value: string): Uint8Array {
  const binary = atob(value.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
