import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { canWrite, parseBearerToken } from '@/app/admin/policy';
import { applyCorrection } from '@/app/reports/correction-service';
import { createAdminRuntime, type AdminRuntime } from './runtime';
import { createD1CorrectionRepository } from '@/infra/persistence/study-correction-repository';
import { createD1StudyAttemptRepository } from '@/infra/persistence/study-attempt-repository';
import { createD1StudySetRepository } from '@/infra/persistence/study-repository';

/** 정정 관리 API (이슈 #53). Bearer 전용(쿠키 미사용), 500 일반화, 원문 로그 금지. */
export interface CorrectionAdminRouteOptions {
  readonly createRuntime?: (env: Env, requestId: string) => AdminRuntime;
}

const correctionBodySchema = z.object({
  questionVersionId: z.string().min(1).max(128),
  reason: z.string().min(1).max(2000),
  source: z.enum(['admin', 'recheck']),
});

function safeIssues(err: { issues: Array<{ path: Array<PropertyKey>; code: string }> }) {
  return err.issues.map((i) => ({ field: i.path.map(String).join('.'), code: i.code }));
}

export function registerCorrectionAdminRoutes(app: Hono<{ Bindings: Env }>, options?: CorrectionAdminRouteOptions): void {
  const createRuntime = options?.createRuntime ?? ((env, requestId) => createAdminRuntime(env, requestId));

  app.post('/api/admin/study-sets/:id/corrections', async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    c.header('Cache-Control', 'no-store');
    const runtime = createRuntime(c.env, crypto.randomUUID());
    const raw = parseBearerToken(c.req.header('authorization'));
    if (!raw) {
      runtime.logger.warn('correction_auth_rejected', 'missing_or_malformed');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const info = await runtime.tokens.verifyToken({ token: raw });
    if (!info) {
      runtime.logger.warn('correction_auth_rejected', 'unknown_or_revoked');
      return c.json({ error: 'unauthorized' }, 401);
    }
    if (!canWrite(info.scope)) {
      runtime.logger.warn('correction_auth_rejected', 'insufficient_scope');
      return c.json({ error: 'forbidden' }, 403);
    }
    try {
      const parsed = correctionBodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        runtime.logger.warn('correction_rejected', 'validation_failed');
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const setId = c.req.param('id');
      if (!setId) return c.json({ error: 'set_not_found' }, 404);
      const studyRepository = createD1StudySetRepository(c.env.DB);
      const existing = await studyRepository.findById({ id: setId });
      if (existing === null) {
        runtime.logger.warn('correction_rejected', 'set_not_found');
        return c.json({ error: 'set_not_found' }, 404);
      }
      const result = await applyCorrection(
        {
          studyRepository,
          correctionRepository: createD1CorrectionRepository(c.env.DB),
          attempts: createD1StudyAttemptRepository(c.env.DB),
        },
        {
          userId: existing.userId,
          setId,
          questionVersionId: parsed.data.questionVersionId,
          reason: parsed.data.reason,
          source: parsed.data.source,
          actor: info.actor,
          now: runtime.now(),
        },
      );
      if (result.outcome === 'rejected') {
        const reason = result.reason;
        if (reason === 'set_not_found') {
          runtime.logger.warn('correction_rejected', 'set_not_found');
          return c.json({ error: 'set_not_found' }, 404);
        }
        if (reason === 'owner_mismatch') {
          runtime.logger.warn('correction_rejected', 'owner_mismatch');
          return c.json({ error: 'owner_mismatch' }, 403);
        }
        if (reason === 'not_submitted') {
          runtime.logger.warn('correction_rejected', 'not_submitted');
          return c.json({ error: 'not_submitted' }, 409);
        }
        runtime.logger.warn('correction_rejected', 'version_not_in_set');
        return c.json({ error: 'version_not_in_set' }, 422);
      }
      runtime.logger.info('correction_applied', result.outcome);
      return c.json({ outcome: result.outcome, corrected: result.corrected }, 200);
    } catch (err) {
      void err;
      runtime.logger.error('correction_internal', 'unexpected');
      return c.json({ error: 'internal' }, 500);
    }
  });
}
