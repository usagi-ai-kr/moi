import type { Hono } from 'hono';
import { endReviewSession, resumeReviewSession } from '@/app/review';
import { isCrossSiteWrite, safeIssues } from './auth';
import { loadVersionContents } from './content';
import { toPendingDto, toResumeItems } from './dto';
import { authedUser, matchesSnapshot, type ReviewRouteRuntimeOptions } from './support';
import { currentQuerySchema, endBodySchema } from './schemas';

export function registerReviewSessionRoutes(app: Hono<{ Bindings: Env }>, options: ReviewRouteRuntimeOptions): void {
  app.get('/api/review/sessions/current', async (c) => {
    c.header('Cache-Control', 'no-store');
    const { session, auth } = await authedUser(c, options.createSessionRuntime);
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('review_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const parsed = currentQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
    try {
      const runtime = options.createRuntime(c.env, crypto.randomUUID());
      const exam = await runtime.resolveExam(parsed.data.examId);
      if (!exam) return c.json({ error: 'not_found' }, 404);
      const deps = runtime.createDeps({ db: c.env.DB });
      const resumed = await resumeReviewSession(deps, { userId: auth.userId, examId: exam.code, mode: parsed.data.mode });
      if (resumed.outcome === 'none') return c.json({ error: 'not_found' }, 404);
      const contents = await loadVersionContents(c.env.DB, resumed.session.items.map((item) => item.questionVersionId));
      if (!matchesSnapshot(resumed.session.items, contents)) return c.json({ error: 'not_found' }, 404);
      const item = resumed.session.items[resumed.session.cursor];
      const current = item ? toPendingDto(item, contents.get(item.questionVersionId)) : null;
      return c.json({ examId: exam.code, mode: parsed.data.mode, status: resumed.session.status, cursor: resumed.session.cursor, total: resumed.session.items.length, current, exhausted: current === null, items: toResumeItems(resumed.session) }, 200);
    } catch {
      return c.json({ error: 'internal' }, 500);
    }
  });

  app.post('/api/review/sessions/current/end', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (isCrossSiteWrite(c)) return c.json({ error: 'forbidden' }, 403);
    const { session, auth } = await authedUser(c, options.createSessionRuntime);
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('review_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const parsed = endBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
    try {
      const runtime = options.createRuntime(c.env, crypto.randomUUID());
      const exam = await runtime.resolveExam(parsed.data.examId);
      if (!exam) return c.json({ error: 'not_found' }, 404);
      const deps = runtime.createDeps({ db: c.env.DB });
      const result = await endReviewSession(deps, { userId: auth.userId, examId: exam.code, mode: parsed.data.mode });
      if (result.outcome === 'rejected') {
        if (result.reason === 'not_found') return c.json({ error: 'not_found' }, 404);
        return c.json({ error: 'conflict' }, 409);
      }
      return c.json({ examId: exam.code, mode: parsed.data.mode, status: 'ended', summary: result.summary }, 200);
    } catch {
      return c.json({ error: 'internal' }, 500);
    }
  });
}
