import type { Context, Hono } from 'hono';
import {
  abandonStudySet,
  answerStudyItem,
  listCompletedSets,
  startStudySet,
  submitStudySet,
} from '@/app/study';
import { ConcurrentSetConflictError } from '@/app/study/ports';
import type { StudySet } from '@/domain/study/types';
import { authenticateSession } from '@/app/session/authenticate-session';
import { createSessionRuntime, type SessionRuntime } from '@/infra/auth/session/runtime';
import { parseSessionCookieValue } from '@/infra/http/session/cookie';
import { createStudyRuntime, type StudyRuntime } from './runtime';
import { abandonBodySchema, answerBodySchema, historyQuerySchema, startSetBodySchema, submitBodySchema } from './schemas';

/**
 * 20문제 세트 HTTP API (이슈 #49 후속, ADR-0020).
 * - 인증: `__Host-moi_session` 쿠키를 세션 런타임으로 검증해 user_id를 얻는다.
 *   body의 userId는 무시한다(IDOR 금지). 미인증 401.
 * - 제출 전 응답에는 정답·해설·근거를 포함하지 않는다(스냅샷 answerOptionIds·explanation·sourceUrls 제거, stem·options만 노출).
 * - `Cache-Control: no-store`. 로그에 세션·토큰·정답 원문 금지.
 */

export interface StudyRouteOptions {
  readonly createRuntime?: (env: Env, requestId: string) => StudyRuntime;
  readonly createSessionRuntime?: (env: Env, requestId: string) => SessionRuntime;
}

type AuthedHandler = (c: Context<{ Bindings: Env }>, runtime: StudyRuntime, userId: string) => Promise<Response>;

function safeIssues(zodError: { issues: Array<{ path: PropertyKey[]; code: string }> }) {
  return zodError.issues.map((i) => ({ field: i.path.map(String).join('.'), code: i.code }));
}

function authed(
  createRuntime: (env: Env, requestId: string) => StudyRuntime,
  createSession: (env: Env, requestId: string) => SessionRuntime,
  handler: AuthedHandler,
) {
  return async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    c.header('Cache-Control', 'no-store');
    const runtime = createRuntime(c.env, crypto.randomUUID());
    const session = createSession(c.env, crypto.randomUUID());
    const token = parseSessionCookieValue(c.req.header('cookie'));
    const auth = await authenticateSession(session.authenticate, { token, now: Math.floor(Date.now() / 1000) });
    if (auth.outcome !== 'authenticated') {
      runtime.logger.warn('study_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    try {
      return await handler(c, runtime, auth.userId);
    } catch (err) {
      void err;
      runtime.logger.error('study_internal', 'unexpected');
      return c.json({ error: 'internal' }, 500);
    }
  };
}

/** 제출 전 DTO — 본문·보기 텍스트는 포함, 정답·해설·근거는 제거한다(#50). */
function toActiveDto(set: StudySet) {
  return {
    id: set.id,
    userId: set.userId,
    examId: set.examId,
    mode: set.mode,
    ...(set.domainId !== undefined ? { domainId: set.domainId } : {}),
    status: set.status,
    createdAt: set.createdAt,
    ...(set.submittedAt !== undefined ? { submittedAt: set.submittedAt } : {}),
    items: set.items.map((item) => ({
      questionId: item.questionId,
      questionVersionId: item.questionVersionId,
      versionNo: item.versionNo,
      optionOrder: [...item.optionOrder],
      stem: item.stem,
      options: item.options.map((o) => ({ optionId: o.optionId, text: o.text })),
      response: item.response,
    })),
  };
}

export function registerStudyRoutes(app: Hono<{ Bindings: Env }>, options?: StudyRouteOptions): void {
  const createRuntime = options?.createRuntime ?? ((env, requestId) => createStudyRuntime(env, requestId));
  const createSession = options?.createSessionRuntime ?? ((env, requestId) => createSessionRuntime(env, requestId));

  app.post(
    '/api/study/sets',
    authed(createRuntime, createSession, async (c, runtime, userId) => {
      const parsed = startSetBodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const { examId, mode } = parsed.data;
      const domainId = parsed.data.domainId;
      try {
        const result = await startStudySet(runtime.createDeps({ examId, db: c.env.DB }), {
          userId,
          examId,
          mode,
          ...(domainId !== undefined ? { domainId } : {}),
        });
        if (result.outcome === 'rejected') {
          if (result.reason === 'active_set_exists') {
            runtime.logger.warn('study_start_rejected', 'active_set_exists');
            return c.json({ error: 'active_set_exists' }, 409);
          }
          return c.json({ error: result.reason }, 422);
        }
        runtime.logger.info('study_set_started', `mode=${mode}`);
        return c.json(toActiveDto(result.set), 201);
      } catch (err) {
        if (err instanceof ConcurrentSetConflictError) {
          runtime.logger.warn('study_start_rejected', 'concurrent_active_set');
          return c.json({ error: 'active_set_exists' }, 409);
        }
        throw err;
      }
    }),
  );

  app.get(
    '/api/study/sets/:id',
    authed(createRuntime, createSession, async (c, runtime, userId) => {
      const id = c.req.param('id');
      if (!id) return c.json({ error: 'not_found' }, 404);
      const deps = runtime.createDeps({ examId: '', db: c.env.DB });
      const set = await deps.repository.findById({ id });
      if (!set || set.userId !== userId) return c.json({ error: 'not_found' }, 404);
      return c.json(set.status === 'submitted' ? set : toActiveDto(set), 200);
    }),
  );

  app.patch(
    '/api/study/sets/:id/answers',
    authed(createRuntime, createSession, async (c, runtime, userId) => {
      const id = c.req.param('id');
      if (!id) return c.json({ error: 'not_found' }, 404);
      const parsed = answerBodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const deps = runtime.createDeps({ examId: '', db: c.env.DB });
      const result = await answerStudyItem(deps, {
        setId: id,
        userId,
        questionId: parsed.data.questionId,
        response: parsed.data.response,
      });
      if (result.outcome === 'rejected') {
        if (result.reason === 'not_found') return c.json({ error: 'not_found' }, 404);
        if (result.reason === 'not_active') return c.json({ error: 'not_active' }, 409);
        return c.json({ error: 'unknown_option' }, 422);
      }
      return c.json({ outcome: result.outcome }, 200);
    }),
  );

  app.post(
    '/api/study/sets/:id/submit',
    authed(createRuntime, createSession, async (c, runtime, userId) => {
      const id = c.req.param('id');
      if (!id) return c.json({ error: 'not_found' }, 404);
      const parsed = submitBodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const deps = runtime.createDeps({ examId: '', db: c.env.DB });
      const result = await submitStudySet(deps, { setId: id, userId, confirmUnanswered: parsed.data.confirmUnanswered });
      if (result.outcome === 'rejected') {
        if (result.reason === 'not_found') return c.json({ error: 'not_found' }, 404);
        if (result.reason === 'not_active') return c.json({ error: 'not_active' }, 409);
        return c.json({ error: 'unanswered_not_confirmed' }, 422);
      }
      runtime.logger.info('study_set_submitted', 'submitted');
      return c.json(result.set, 200);
    }),
  );

  app.post(
    '/api/study/sets/:id/abandon',
    authed(createRuntime, createSession, async (c, runtime, userId) => {
      const id = c.req.param('id');
      if (!id) return c.json({ error: 'not_found' }, 404);
      const parsed = abandonBodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const deps = runtime.createDeps({ examId: '', db: c.env.DB });
      const result = await abandonStudySet(deps, { setId: id, userId, confirm: parsed.data.confirm });
      if (result.outcome === 'rejected') {
        if (result.reason === 'not_found') return c.json({ error: 'not_found' }, 404);
        if (result.reason === 'not_active') return c.json({ error: 'not_active' }, 409);
        return c.json({ error: 'confirmation_required' }, 422);
      }
      runtime.logger.info('study_set_abandoned', 'abandoned');
      return c.json(toActiveDto(result.set), 200);
    }),
  );

  app.get(
    '/api/study/sets',
    authed(createRuntime, createSession, async (c, runtime, userId) => {
      const parsed = historyQuerySchema.safeParse(c.req.query());
      if (!parsed.success) {
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const deps = runtime.createDeps({ examId: '', db: c.env.DB });
      const page = await listCompletedSets(deps, { userId, page: parsed.data.page, pageSize: parsed.data.pageSize });
      return c.json({ items: page.items, total: page.total, page: parsed.data.page, pageSize: parsed.data.pageSize }, 200);
    }),
  );
}
