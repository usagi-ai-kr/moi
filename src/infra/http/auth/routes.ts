import type { Hono } from 'hono';
import { z } from 'zod';
import { completeKakaoLogin, type KakaoLoginRejection } from '@/app/auth/complete-kakao-login';
import { startKakaoLogin } from '@/app/auth/start-kakao-login';
import {
  createKakaoAuthRuntime,
  type KakaoAuthRuntime,
} from '@/infra/auth/kakao/runtime';
import { parseOAuthCookieValue, serializeOAuthCookie, serializeOAuthCookieClearance } from '@/infra/auth/kakao/oauth-cookie';

/**
 * 카카오 인증 라우트 (ADR-0003, 이슈 #2).
 * - 성공/실패 모두 토큰·sub를 브라우저에 반환하지 않는다(공통 HTML + Cache-Control: no-store).
 * - 실패: 400(잘못된 state/바인딩/취소) 또는 502(upstream/토큰교환/JWKS). 내부 오류 코드 미노출.
 */

const callbackQuerySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().min(1).max(256).optional(),
  error_description: z.string().max(1024).optional(),
  error_uri: z.string().max(1024).optional(),
});

const BAD_REQUEST_REJECTIONS: ReadonlySet<KakaoLoginRejection> = new Set([
  'invalid_state',
  'browser_binding_mismatch',
  'user_cancelled',
]);

function failureHtml(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>moi 로그인 실패</title></head><body><main><h1>로그인에 실패했어요</h1><p>일시적인 문제이거나 로그인 요청이 만료되었어요. 잠시 후 처음부터 다시 시도해 주세요.</p></main></body></html>`;
}

function successHtml(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>moi 로그인</title></head><body><main><h1>로그인을 처리했어요</h1><p>창을 닫고 서비스로 돌아가 주세요.</p></main></body></html>`;
}

function htmlResponse(html: string, status: 200 | 400 | 502, extraHeaders?: Record<string, string>): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}

export interface AuthRouteOptions {
  /** 테스트에서 포트를 스파이로 감싸는 등 런타임 조립을 교체한다(기본: Env 기반). */
  readonly createRuntime?: (env: Env, requestId: string) => KakaoAuthRuntime;
}

export function registerAuthRoutes(app: Hono<{ Bindings: Env }>, options?: AuthRouteOptions): void {
  const createRuntime = options?.createRuntime ?? createKakaoAuthRuntime;

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
      return htmlResponse(failureHtml(), 502);
    }
  });

  app.get('/auth/kakao/callback', async (c) => {
    const requestId = crypto.randomUUID();
    const runtime = createRuntime(c.env, requestId);
    // 모든 콜백 응답에서 임시 쿠키를 삭제한다 — 성공/실패와 무관하게 브라우저에 잔존하지 않는다.
    const clearCookie = serializeOAuthCookieClearance();
    const parsedQuery = callbackQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      runtime.complete.logger.warn('kakao_login_rejected', 'invalid_state');
      return htmlResponse(failureHtml(), 400, { 'set-cookie': clearCookie });
    }
    const query = parsedQuery.data;
    const bindingToken = parseOAuthCookieValue(c.req.header('cookie'));

    try {
      const result = await completeKakaoLogin(runtime.complete, {
        code: query.code,
        state: query.state,
        error: query.error,
        browserBindingToken: bindingToken,
        now: Math.floor(Date.now() / 1000),
      });
      if (result.outcome === 'success') {
        // 세션 발급(0.1.3/#4) 전까지는 공통 안내 화면만 — identity/sub는 반환하지 않는다.
        return htmlResponse(successHtml(), 200, { 'set-cookie': clearCookie });
      }
      return htmlResponse(failureHtml(), BAD_REQUEST_REJECTIONS.has(result.reason) ? 400 : 502, {
        'set-cookie': clearCookie,
      });
    } catch {
      // D1 장애 등 예기치 못한 오류 — 소비 여부 불명이나 fail-closed 재시도는 재로그인뿐이다.
      runtime.complete.logger.error('kakao_login_failed', 'upstream_failure');
      return htmlResponse(failureHtml(), 502, { 'set-cookie': clearCookie });
    }
  });
}
