/**
 * `__Host-moi_oauth` 브라우저 한정 임시 쿠키 (ADR-0003).
 * Secure·HttpOnly·SameSite=Lax·Path=/·Domain 없음·Max-Age=600 — `__Host-` 접두 요구를 만족한다.
 */
export const OAUTH_COOKIE_NAME = '__Host-moi_oauth';

export function serializeOAuthCookie(token: string, maxAgeSeconds: number): string {
  return `${OAUTH_COOKIE_NAME}=${token}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

/** 콜백 모든 응답에서 임시 쿠키를 삭제한다(Max-Age=0) — 로그인 시도 종료 후 브라우저에 잔존하지 않는다. */
export function serializeOAuthCookieClearance(): string {
  return `${OAUTH_COOKIE_NAME}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function parseOAuthCookieValue(cookieHeader: string | null | undefined): string | null {
  if (cookieHeader === null || cookieHeader === undefined || cookieHeader.length === 0) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === OAUTH_COOKIE_NAME) {
      const value = part.slice(idx + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}
