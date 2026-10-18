import { Hono } from 'hono';
import { registerAuthRoutes } from './auth/routes';
import type { KakaoAuthRuntime } from '@/infra/auth/kakao/runtime';

export interface CreateAppOptions {
  /** 테스트에서 카카오 인증 포트를 스파이로 감싸는 등 조립을 교체할 때 사용한다. */
  readonly createAuthRuntime?: (env: Env, requestId: string) => KakaoAuthRuntime;
}

// Hono 앱 조립 — 라우트 등록 (DI/조립은 src/bootstrap/worker) [ADR-0001/0011]
export function createApp(options?: CreateAppOptions) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/api/health', (c) => c.json({ ok: true }));

  // 0.1.3(#4)에서 실제 PASETO 세션 검증으로 대체. 지금은 미인증 응답 계약만 고정.
  app.get('/api/me', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'unauthorized' }, 401);
  });

  registerAuthRoutes(app, { createRuntime: options?.createAuthRuntime });

  return app;
}
