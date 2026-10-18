import type { Hono } from 'hono';
import { authenticateSession, type AuthenticateSessionResult } from '@/app/session/authenticate-session';
import { revokeSession } from '@/app/session/revoke-session';
import { createSessionRuntime, type SessionRuntime } from '@/infra/auth/session/runtime';
import { parseSessionCookieValue, serializeSessionCookieClearance } from './cookie';

/**
 * 세션 라우트 (이슈 #4, ADR-0005/0006).
 * - GET /api/me: 200 `{ user: { id } }`(내부 UUID) / 미인증·변조·만료·폐기 401, no-store.
 * - POST /auth/logout: CSRF(Origin + Sec-Fetch-Site) 검증 실패 403 → 미인증 401 →
 *   성공 204 + D1 revoke + 쿠키 삭제(Max-Age=0). 같은 PASETO 재사용 401.
 * - CSRF 판정: Sec-Fetch-Site가 있고 same-origin이 아니면 차단, Origin이 있고
 *   동일 오리진이 아니면 차단. 둘 다 없는 요청은 브라우저가 아닌 에이전트(쿠키 첨부 불가)로 허용한다.
 */

export interface SessionRouteOptions {  readonly createRuntime?: (env: Env, requestId: string) => SessionRuntime;
}

function isCrossSiteRequest(headers: Headers, requestUrl: string): boolean {
  const secFetchSite = headers.get('sec-fetch-site');
  if (secFetchSite !== null && secFetchSite !== 'same-origin') {
    return true;
  }
  const origin = headers.get('origin');
  if (origin !== null && origin !== new URL(requestUrl).origin) {
    return true;
  }
  return false;
}

export function registerSessionRoutes(app: Hono<{ Bindings: Env }>, options?: SessionRouteOptions): void {
  const createRuntime = options?.createRuntime ?? createSessionRuntime;

  app.get('/api/me', async (c) => {
    const runtime = createRuntime(c.env, crypto.randomUUID());
    const token = parseSessionCookieValue(c.req.header('cookie'));
    const result: AuthenticateSessionResult = await authenticateSession(runtime.authenticate, {
      token,
      now: Math.floor(Date.now() / 1000),
    });
    c.header('Cache-Control', 'no-store');
    if (result.outcome === 'authenticated') {
      return c.json({ user: { id: result.userId } });
    }
    return c.json({ error: 'unauthorized' }, 401);
  });

  app.post('/auth/logout', async (c) => {
    const runtime = createRuntime(c.env, crypto.randomUUID());
    c.header('Cache-Control', 'no-store');
    if (isCrossSiteRequest(c.req.raw.headers, c.req.url)) {
      runtime.logger.warn('logout_rejected', 'cross_site_request');
      return c.json({ error: 'forbidden' }, 403);
    }
    const token = parseSessionCookieValue(c.req.header('cookie'));
    const result = await revokeSession(runtime.revoke, { token, now: Math.floor(Date.now() / 1000) });
    if (result.outcome !== 'revoked') {
      return c.json({ error: 'unauthorized' }, 401);
    }
    c.header('Set-Cookie', serializeSessionCookieClearance());
    return c.body(null, 204);
  });
}
