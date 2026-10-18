/**
 * `__Host-moi_session` 쿠키 (이슈 #4, ADR-0005).
 * Secure·HttpOnly·SameSite=Lax·Path=/·Domain 없음·Max-Age=세션 만료 차이(24h).
 * 로그아웃/실패 시 Max-Age=0 삭제 헤더.
 */
export const SESSION_COOKIE_NAME = '__Host-moi_session';

export function serializeSessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE_NAME}=${token}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function serializeSessionCookieClearance(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function parseSessionCookieValue(cookieHeader: string | null | undefined): string | null {
  if (cookieHeader === null || cookieHeader === undefined || cookieHeader.length === 0) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(idx + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}
