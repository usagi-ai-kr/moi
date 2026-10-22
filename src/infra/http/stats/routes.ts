import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { authenticateSession } from '@/app/session/authenticate-session';
import { getStudyStats } from '@/app/stats/study-stats-service';
import { createSessionRuntime, type SessionRuntime } from '@/infra/auth/session/runtime';
import { parseSessionCookieValue } from '@/infra/http/session/cookie';
import { createD1StudyHistoryPort } from '@/infra/persistence/study-attempt-history';
import { createD1StudyQuestionCountPort } from '@/infra/persistence/study-question-counts';

const statsQuerySchema = z.object({ examId: z.string().min(1).max(128) });

export interface StatsRouteOptions {
  readonly createSessionRuntime?: (env: Env, requestId: string) => SessionRuntime;
}

function safeIssues(e: { issues: Array<{ path: PropertyKey[]; code: string }> }) {
  return e.issues.map((i) => ({ field: i.path.map(String).join('.'), code: i.code }));
}

export function registerStatsRoutes(app: Hono<{ Bindings: Env }>, options?: StatsRouteOptions): void {
  const createSession = options?.createSessionRuntime ?? ((env, requestId) => createSessionRuntime(env, requestId));
  app.get('/api/study/stats', async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    c.header('Cache-Control', 'no-store');
    const session = createSession(c.env, crypto.randomUUID());
    const token = parseSessionCookieValue(c.req.header('cookie'));
    const auth = await authenticateSession(session.authenticate, { token, now: Math.floor(Date.now() / 1000) });
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('stats_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    try {
      const parsed = statsQuerySchema.safeParse(c.req.query());
      if (!parsed.success) return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
      const stats = await getStudyStats(
        {
          history: createD1StudyHistoryPort(c.env.DB),
          questionCounts: createD1StudyQuestionCountPort(c.env.DB),
          clock: { now: () => Date.now() },
        },
        { userId: auth.userId, examId: parsed.data.examId },
      );
      return c.json(stats, 200);
    } catch (err) {
      void err;
      session.logger.error('stats_internal', 'unexpected');
      return c.json({ error: 'internal' }, 500);
    }
  });
}
