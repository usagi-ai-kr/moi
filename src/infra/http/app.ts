import { Hono } from 'hono';
import { registerAdminRoutes } from './admin/routes';
import { registerCorrectionAdminRoutes } from './admin/correction-routes';
import { registerAuthRoutes } from './auth/routes';
import { registerCorrectionListRoutes } from './corrections/routes';
import { registerReportRoutes } from './reports/routes';
import { registerSessionRoutes } from './session/routes';
import { registerStatsRoutes } from './stats/routes';
import { registerStudyRoutes } from './study/routes';
import type { AdminRuntime } from './admin/runtime';
import type { StudyRuntime } from './study/runtime';
import type { KakaoAuthRuntime } from '@/infra/auth/kakao/runtime';
import type { SessionRuntime } from '@/infra/auth/session/runtime';

export interface CreateAppOptions {
  /** 테스트에서 카카오 인증 포트를 스파이로 감싸는 등 조립을 교체할 때 사용한다. */
  readonly createAuthRuntime?: (env: Env, requestId: string) => KakaoAuthRuntime;
  /** 테스트에서 세션 포트를 교체할 때 사용한다. */
  readonly createSessionRuntime?: (env: Env, requestId: string) => SessionRuntime;
  /** 테스트에서 관리 API 런타임을 교체할 때 사용한다. */
  readonly createAdminRuntime?: (env: Env, requestId: string) => AdminRuntime;
  /** 테스트에서 학습 세트 런타임을 교체할 때 사용한다. */
  readonly createStudyRuntime?: (env: Env, requestId: string) => StudyRuntime;
}

// Hono 앱 조립 — 라우트 등록 (DI/조립은 src/bootstrap/worker) [ADR-0001/0011]
export function createApp(options?: CreateAppOptions) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/api/health', (c) => c.json({ ok: true }));

  // /api/me + /auth/logout: 실제 PASETO 세션 검증 (ADR-0005)
  registerSessionRoutes(app, { createRuntime: options?.createSessionRuntime });
  registerAuthRoutes(app, {
    createRuntime: options?.createAuthRuntime,
    createSessionRuntime: options?.createSessionRuntime,
  });
  registerAdminRoutes(app, { createRuntime: options?.createAdminRuntime });
  registerCorrectionAdminRoutes(app, { createRuntime: options?.createAdminRuntime });
  registerStudyRoutes(app, {
    createRuntime: options?.createStudyRuntime,
    createSessionRuntime: options?.createSessionRuntime,
  });
  registerReportRoutes(app, { createSessionRuntime: options?.createSessionRuntime });
  registerCorrectionListRoutes(app, { createSessionRuntime: options?.createSessionRuntime });
  registerStatsRoutes(app, { createSessionRuntime: options?.createSessionRuntime });

  return app;
}
