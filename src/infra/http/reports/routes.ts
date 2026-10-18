import type { Context, Hono } from 'hono';
import { submitQuestionReport } from '@/app/reports/index';
import { authenticateSession } from '@/app/session/authenticate-session';
import { createSessionRuntime, type SessionRuntime } from '@/infra/auth/session/runtime';
import { parseSessionCookieValue } from '@/infra/http/session/cookie';
import { createD1ReportRepository } from '@/infra/persistence/report-repository';
import { reportBodySchema } from './schemas';

/**
 * 신고 제출 HTTP API (이슈 #53, ADR-0021).
 * - 인증: `__Host-moi_session` 쿠키를 세션 런타임으로 검증해 user_id를 얻는다. 미인증 401.
 * - `question_versions`의 (id, question_id) 일치를 확인해 422 `invalid_question`.
 * - recorded → 201(신고율·중지·재검수 필드), duplicate → 200 `{outcome:'duplicate'}`.
 * - `Cache-Control: no-store`. 로그에 본문·userId·토큰 원문 금지(화이트리스트 로거).
 */

export interface ReportRouteOptions {
  readonly createSessionRuntime?: (env: Env, requestId: string) => SessionRuntime;
}

function safeIssues(zodError: { issues: Array<{ path: PropertyKey[]; code: string }> }) {
  return zodError.issues.map((i) => ({ field: i.path.map(String).join('.'), code: i.code }));
}

export function registerReportRoutes(app: Hono<{ Bindings: Env }>, options?: ReportRouteOptions): void {
  const createSession = options?.createSessionRuntime ?? ((env: Env, requestId: string) => createSessionRuntime(env, requestId));

  app.post('/api/study/reports', async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    c.header('Cache-Control', 'no-store');
    const session = createSession(c.env, crypto.randomUUID());
    const token = parseSessionCookieValue(c.req.header('cookie'));
    const auth = await authenticateSession(session.authenticate, { token, now: Math.floor(Date.now() / 1000) });
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('report_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    try {
      const parsed = reportBodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      }
      const { questionId, questionVersionId, reason } = parsed.data;
      const version = await c.env.DB.prepare('SELECT 1 FROM question_versions WHERE id = ?1 AND question_id = ?2')
        .bind(questionVersionId, questionId)
        .first();
      if (!version) {
        session.logger.warn('report_rejected', 'invalid_question');
        return c.json({ error: 'invalid_question' }, 422);
      }
      const result = await submitQuestionReport(
        { repository: createD1ReportRepository(c.env.DB) },
        { id: crypto.randomUUID(), questionId, questionVersionId, reason, userId: auth.userId, now: Date.now() },
      );
      if (result.outcome === 'duplicate') {
        session.logger.info('report_duplicate', 'duplicate');
        return c.json({ outcome: 'duplicate' }, 200);
      }
      session.logger.info('report_recorded', 'recorded');
      return c.json(result, 201);
    } catch (err) {
      void err;
      session.logger.error('report_internal', 'unexpected');
      return c.json({ error: 'internal' }, 500);
    }
  });
}
