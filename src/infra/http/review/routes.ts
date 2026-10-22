import type { Hono } from 'hono';
import { createSessionRuntime } from '@/infra/auth/session/runtime';
import { createReviewRuntime } from './runtime';
import { registerReviewAnswerRoutes } from './answer-routes';
import { registerReviewBookmarkRoutes } from './bookmark-routes';
import { registerReviewCandidateRoutes } from './candidate-routes';
import { registerReviewSessionRoutes } from './session-routes';
import type { ReviewRouteOptions, ReviewRouteRuntimeOptions } from './support';

export type { ReviewRouteOptions } from './support';

/** 복습 HTTP API (#51/#130, ADR-0037/0039/0041). 각 경로는 목적별 모듈에서 등록한다. */
export function registerReviewRoutes(app: Hono<{ Bindings: Env }>, options?: ReviewRouteOptions): void {
  const resolved: ReviewRouteRuntimeOptions = {
    createRuntime: options?.createRuntime ?? ((env, requestId) => createReviewRuntime(env, requestId)),
    createSessionRuntime: options?.createSessionRuntime ?? ((env, requestId) => createSessionRuntime(env, requestId)),
  };
  registerReviewCandidateRoutes(app, resolved);
  registerReviewSessionRoutes(app, resolved);
  registerReviewAnswerRoutes(app, resolved);
  registerReviewBookmarkRoutes(app, resolved);
}
