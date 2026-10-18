import type { Hono } from 'hono';
import { z } from 'zod';
import { completeKakaoLogin, type KakaoLoginRejection } from '@/app/auth/complete-kakao-login';
import { startKakaoLogin } from '@/app/auth/start-kakao-login';
import { completeLogin, type CompleteLoginDeps, type CompleteLoginResult } from '@/app/session/complete-login';
import { createKakaoAuthRuntime, type KakaoAuthRuntime } from '@/infra/auth/kakao/runtime';
import { createSessionRuntime, type SessionRuntime } from '@/infra/auth/session/runtime';
import { resolveOrCreateUser } from '@/app/identity/resolve-or-create-user';
import { issueUserSession } from '@/app/session/issue-user-session';
import { parseOAuthCookieValue, serializeOAuthCookie, serializeOAuthCookieClearance } from '@/infra/auth/kakao/oauth-cookie';
import { serializeSessionCookie } from '@/infra/http/session/cookie';

/**
 * 카카오 인증 라우트 (ADR-0003/0005, 이슈 #2/#4).
 * - `GET /auth/kakao`: state/nonce/verifier/바인딩 생성 → 인가 URL 302 + 임시 쿠키 발급.
 * - `GET /auth/kakao/callback`: 검증 성공 → 내부 user resolve(#3) → 세션 발급(#4) →
 *   `302 /?auth=success` + 세션 쿠키. 실패/취소/장애 모두 `302 /?auth=error` + 임시 쿠키 삭제.
 *   토큰·sub·오류 코드는 응답(URL·본문)에 노출되지 않는다(로그는 결과 코드만, ADR-0006).
 */

const callbackQuerySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().min(1).max(256).optional(),
  error_description: z.string().max(1024).optional(),
  error_uri: z.string().max(1024).optional(),
});

export interface AuthRouteOptions {
  /** 테스트에서 포트를 스파이로 감싸는 등 런타임 조립을 교체한다(기본: Env 기반). */
  readonly createRuntime?: (env: Env, requestId: string) => KakaoAuthRuntime;
  readonly createSessionRuntime?: (env: Env, requestId: string) => SessionRuntime;
}

function wireCompleteLogin(authRuntime: KakaoAuthRuntime, sessionRuntime: SessionRuntime): CompleteLoginDeps {
  return {
    completeKakaoLogin: (input) => completeKakaoLogin(authRuntime.complete, input),
    resolveOrCreateUser: (input) => resolveOrCreateUser(sessionRuntime.resolveIdentity, input),
    issueUserSession: (input) => issueUserSession(sessionRuntime.issue, input),
    logger: sessionRuntime.logger,
  };
}

/** 콜백 응답: 성공/실패 모두 302, no-store. Set-Cookie는 복수(세션 발급+임시 쿠키 삭제) 가능. */
function callbackRedirect(location: string, setCookies: Array<string>): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}

export function registerAuthRoutes(app: Hono<{ Bindings: Env }>, options?: AuthRouteOptions): void {
  const createRuntime = options?.createRuntime ?? createKakaoAuthRuntime;
  const createSession = options?.createSessionRuntime ?? createSessionRuntime;

  app.get('/auth/kakao', async (c) => {
    const requestId = crypto.randomUUID();
    const runtime = createRuntime(c.env, requestId);
    try {
      const started = await startKakaoLogin(runtime.start, { now: Math.floor(Date.now() / 1000) });
      c.header('Cache-Control', 'no-store');
      c.header('Set-Cookie', serializeOAuthCookie(started.browserBindingToken, started.cookieMaxAge));
      return c.redirect(started.authorizeUrl, 302);
    } catch {
      // D1 저장 실패 등 — 원문(state/verifier)은 이 지점에서 이미 로그에 없다.
      runtime.start.logger.error('kakao_login_start_failed', 'upstream_failure');
      return callbackRedirect('/?auth=error', [serializeOAuthCookieClearance()]);
    }
  });

  app.get('/auth/kakao/callback', async (c) => {
    const requestId = crypto.randomUUID();
    const authRuntime = createRuntime(c.env, requestId);
    const sessionRuntime = createSession(c.env, requestId);
    // 임시 쿠키는 모든 콜백 응답에서 삭제된다(성공/실패 무관).
    const oauthClearance = serializeOAuthCookieClearance();
    const parsedQuery = callbackQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      sessionRuntime.logger.warn('kakao_login_rejected', 'invalid_state');
      return callbackRedirect('/?auth=error', [oauthClearance]);
    }
    const query = parsedQuery.data;
    const bindingToken = parseOAuthCookieValue(c.req.header('cookie'));
    const now = Math.floor(Date.now() / 1000);

    try {
      const result: CompleteLoginResult = await completeLogin(wireCompleteLogin(authRuntime, sessionRuntime), {
        code: query.code,
        state: query.state,
        error: query.error,
        browserBindingToken: bindingToken,
        now,
      });
      if (result.outcome === 'success') {
        const sessionMaxAge = Math.max(1, result.session.expiresAt - now);
        return callbackRedirect('/?auth=success', [
          serializeSessionCookie(result.session.token, sessionMaxAge),
          oauthClearance,
        ]);
      }
      return callbackRedirect('/?auth=error', [oauthClearance]);
    } catch {
      // D1 장애 등 예기치 못한 오류 — 원문 없이 공통 실패로 수렴한다.
      sessionRuntime.logger.error('login_failed', 'upstream_failure');
      return callbackRedirect('/?auth=error', [oauthClearance]);
    }
  });
}

export type { KakaoLoginRejection };
