import type { Context, Hono } from 'hono';
import { BulkValidationError, importQuestionBulk } from '@/app/admin/questions-admin';
import {
  fetchQuestionDetail,
  QuestionNotFoundError,
  retireQuestion,
  reviseQuestionVersion,
} from '@/app/admin/question-revision';
import { canRead, canWrite, parseBearerToken } from '@/app/admin/policy';
import { auditQuerySchema, bulkBodySchema, patchBodySchema, singleBodySchema } from './schemas';
import { createAdminRuntime, type AdminRuntime } from './runtime';

/**
 * 관리 API 라우트 (이슈 #47, ADR-0019).
 * - `POST /api/admin/questions/bulk` — 일괄 등록(`Idempotency-Key` 필수, 원자적, 201/422/409).
 * - `POST /api/admin/questions` — 단건 등록(201/422).
 * - `PATCH /api/admin/questions/:id` — 새 개정(200/404/422).
 * - `POST /api/admin/questions/:id/deactivate` — 비활성화(200/404, 물리 삭제 없음).
 * - `GET /api/admin/questions/:id` — 현재 버전/상태(200/404).
 * - `GET /api/admin/audit` — 최근 감사(200, limit/offset).
 * - Bearer 헤더 전용(쿠키 미사용). 500은 일반화하고 원문·토큰을 로그·응답에 남기지 않는다.
 * - 프로덕션 조립(createApp 편입)은 오케스트레이터 후속 — 본 모듈은 `registerAdminRoutes`로 독립 등록한다.
 */

export interface AdminRouteOptions {
  readonly createRuntime?: (env: Env, requestId: string) => AdminRuntime;
}

type AdminHandler = (c: Context<{ Bindings: Env }>, runtime: AdminRuntime, actor: string) => Promise<Response>;

function safeIssues(zodError: { issues: Array<{ path: Array<PropertyKey>; code: string }> }) {
  return zodError.issues.map((i) => ({ field: i.path.map(String).join('.'), code: i.code }));
}

function authed(
  createRuntime: (env: Env, requestId: string) => AdminRuntime,
  kind: 'read' | 'write',
  handler: AdminHandler,
) {
  return async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    const runtime = createRuntime(c.env, crypto.randomUUID());
    const raw = parseBearerToken(c.req.header('authorization'));
    if (!raw) {
      runtime.logger.warn('admin_auth_rejected', 'missing_or_malformed');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const info = await runtime.tokens.verifyToken({ token: raw });
    if (!info) {
      runtime.logger.warn('admin_auth_rejected', 'unknown_or_revoked');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const ok = kind === 'write' ? canWrite(info.scope) : canRead(info.scope);
    if (!ok) {
      runtime.logger.warn('admin_auth_rejected', 'insufficient_scope');
      return c.json({ error: 'forbidden' }, 403);
    }
    try {
      return await handler(c, runtime, info.actor);
    } catch (err) {
      void err;
      runtime.logger.error('admin_internal', 'unexpected');
      return c.json({ error: 'internal' }, 500);
    }
  };
}

function audited(runtime: AdminRuntime) {
  return (a: { actor: string; action: string; targetType: string; targetId: string; requestId: string; now: number }) =>
    runtime.questions.appendAuditLog({ ...a, id: crypto.randomUUID() });
}

export function registerAdminRoutes(app: Hono<{ Bindings: Env }>, options?: AdminRouteOptions): void {
  const createRuntime = options?.createRuntime ?? ((env, requestId) => createAdminRuntime(env, requestId));

  app.post(
    '/api/admin/questions/bulk',
    authed(createRuntime, 'write', async (c, runtime, actor) => {
      const key = c.req.header('idempotency-key')?.trim();
      if (!key) {
        runtime.logger.warn('admin_bulk_rejected', 'missing_idempotency_key');
        return c.json({ error: 'idempotency_key_required' }, 422);
      }
      const bodyText = await c.req.text();
      let body: unknown;
      try {
        body = JSON.parse(bodyText);
      } catch {
        runtime.logger.warn('admin_bulk_rejected', 'invalid_json');
        return c.json({ error: 'invalid_json' }, 422);
      }
      const requestHash = await runtime.idempotency.computeRequestHash({
        method: 'POST',
        path: '/api/admin/questions/bulk',
        bodyText,
      });
      const existing = await runtime.idempotency.findByKey({ key });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          runtime.logger.warn('admin_bulk_rejected', 'idempotency_conflict');
          return c.json({ error: 'idempotency_conflict' }, 409);
        }
        return c.json(JSON.parse(existing.responseBody), 201);
      }
      const parsed = bulkBodySchema.safeParse(body);
      if (!parsed.success) {
        runtime.logger.warn('admin_bulk_rejected', 'validation_failed');
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const now = runtime.now();
      try {
        const result = await importQuestionBulk(
          { questions: runtime.questions, exams: runtime.exams, audit: audited(runtime) },
          { items: parsed.data.items, actor, requestId: crypto.randomUUID(), now },
        );
        const responseBody = JSON.stringify(result);
        await runtime.idempotency.save({ key, requestHash, statusCode: 201, responseBody, now });
        runtime.logger.info('admin_bulk_created', `count=${result.created.length}`);
        return c.json(result, 201);
      } catch (err) {
        if (err instanceof BulkValidationError) {
          runtime.logger.warn('admin_bulk_rejected', `items_failed=${err.failures.length}`);
          return c.json({ error: 'bulk_failed', failures: err.failures }, 422);
        }
        throw err;
      }
    }),
  );

  app.post(
    '/api/admin/questions',
    authed(createRuntime, 'write', async (c, runtime, actor) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        runtime.logger.warn('admin_create_rejected', 'invalid_json');
        return c.json({ error: 'invalid_json' }, 422);
      }
      const parsed = singleBodySchema.safeParse(body);
      if (!parsed.success) {
        runtime.logger.warn('admin_create_rejected', 'validation_failed');
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      try {
        const result = await importQuestionBulk(
          { questions: runtime.questions, exams: runtime.exams, audit: audited(runtime) },
          { items: [parsed.data], actor, requestId: crypto.randomUUID(), now: runtime.now() },
        );
        runtime.logger.info('admin_question_created', 'single');
        return c.json(result.created[0], 201);
      } catch (err) {
        if (err instanceof BulkValidationError) {
          return c.json({ error: 'bulk_failed', failures: err.failures }, 422);
        }
        throw err;
      }
    }),
  );

  app.patch(
    '/api/admin/questions/:id',
    authed(createRuntime, 'write', async (c, runtime, actor) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid_json' }, 422);
      }
      const parsed = patchBodySchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const questionId = c.req.param('id');
      if (!questionId) return c.json({ error: 'not_found' }, 404);
      try {
        const result = await reviseQuestionVersion(
          { questions: runtime.questions, exams: runtime.exams, audit: audited(runtime) },
          { questionId, ...parsed.data, actor, requestId: crypto.randomUUID(), now: runtime.now() },
        );
        runtime.logger.info('admin_question_revised', 'single');
        return c.json(result, 200);
      } catch (err) {
        if (err instanceof QuestionNotFoundError) return c.json({ error: 'not_found' }, 404);
        if (err instanceof BulkValidationError) {
          return c.json({ error: 'bulk_failed', failures: err.failures }, 422);
        }
        throw err;
      }
    }),
  );

  app.post(
    '/api/admin/questions/:id/deactivate',
    authed(createRuntime, 'write', async (c, runtime, actor) => {
      const questionId = c.req.param('id');
      if (!questionId) return c.json({ error: 'not_found' }, 404);
      try {
        await retireQuestion(
          { questions: runtime.questions, exams: runtime.exams, audit: audited(runtime) },
          { questionId, actor, requestId: crypto.randomUUID(), now: runtime.now() },
        );
        runtime.logger.info('admin_question_deactivated', 'single');
        return c.json({ questionId, status: 'inactive' }, 200);
      } catch (err) {
        if (err instanceof QuestionNotFoundError) return c.json({ error: 'not_found' }, 404);
        throw err;
      }
    }),
  );

  app.get(
    '/api/admin/questions/:id',
    authed(createRuntime, 'read', async (c, runtime) => {
      const questionId = c.req.param('id');
      if (!questionId) return c.json({ error: 'not_found' }, 404);
      const detail = await fetchQuestionDetail(runtime.questions, { questionId });
      if (!detail) return c.json({ error: 'not_found' }, 404);
      return c.json(detail, 200);
    }),
  );

  app.get(
    '/api/admin/audit',
    authed(createRuntime, 'read', async (c, runtime) => {
      const parsed = auditQuerySchema.safeParse(c.req.query());
      if (!parsed.success) {
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const result = await runtime.audits.list(parsed.data);
      return c.json({ items: result.items, total: result.total, limit: parsed.data.limit, offset: parsed.data.offset }, 200);
    }),
  );
}
