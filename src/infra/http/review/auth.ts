import type { Context } from 'hono';

/**
 * 복습 쓰기 CSRF 가드 (session/logout과 동일 판정, #130).
 * - Sec-Fetch-Site가 있고 same-origin이 아니면 차단.
 * - Origin이 있고 요청 origin과 다르면 차단.
 */
export function isCrossSiteWrite(c: Context<{ Bindings: Env }>): boolean {
  const secFetchSite = c.req.header('sec-fetch-site');
  if (secFetchSite !== null && secFetchSite !== undefined && secFetchSite !== '' && secFetchSite !== 'same-origin') {
    return true;
  }
  const origin = c.req.header('origin');
  if (origin !== null && origin !== undefined && origin !== '') {
    try {
      if (origin !== new URL(c.req.url).origin) return true;
    } catch {
      return true;
    }
  }
  return false;
}

export function safeIssues(zodError: { issues: Array<{ path: PropertyKey[]; code: string }> }) {
  return zodError.issues.map((i) => ({ field: i.path.map(String).join('.'), code: i.code }));
}
