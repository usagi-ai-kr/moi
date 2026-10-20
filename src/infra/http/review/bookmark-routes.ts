import type { Context, Hono } from 'hono';
import { InvalidReviewQuestionError } from '@/app/review/errors';
import { setReviewBookmark } from '@/app/review';
import { safeIssues, isCrossSiteWrite } from './auth';
import { loadVersionContents } from './content';
import { authedUser, type ReviewRouteRuntimeOptions } from './support';
import { bookmarkBodySchema, bookmarkQuerySchema } from './schemas';

export function registerReviewBookmarkRoutes(app: Hono<{ Bindings: Env }>, options: ReviewRouteRuntimeOptions): void {
  async function handleBookmarkSet(c: Context<{ Bindings: Env }>) {
    c.header('Cache-Control', 'no-store');
    if (isCrossSiteWrite(c)) return c.json({ error: 'forbidden' }, 403);
    const { session, auth } = await authedUser(c, options.createSessionRuntime);
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('review_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const parsed = bookmarkBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
    try {
      const runtime = options.createRuntime(c.env, crypto.randomUUID());
      const exam = await runtime.resolveExam(parsed.data.examId);
      if (!exam) return c.json({ error: 'not_found' }, 404);
      const deps = runtime.createDeps({ db: c.env.DB });
      const result = await setReviewBookmark(deps, { userId: auth.userId, examId: exam.code, questionId: parsed.data.questionId, bookmarked: parsed.data.bookmarked });
      return c.json({ questionId: parsed.data.questionId, bookmarked: result.bookmarked }, 200);
    } catch (err) {
      if (err instanceof InvalidReviewQuestionError) return c.json({ error: 'invalid_question' }, 422);
      return c.json({ error: 'internal' }, 500);
    }
  }

  app.patch('/api/review/bookmarks', handleBookmarkSet);

  app.get('/api/review/bookmarks', async (c) => {
    c.header('Cache-Control', 'no-store');
    const { session, auth } = await authedUser(c, options.createSessionRuntime);
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('review_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const parsed = bookmarkQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
    try {
      const runtime = options.createRuntime(c.env, crypto.randomUUID());
      const exam = await runtime.resolveExam(parsed.data.examId);
      if (!exam) return c.json({ error: 'not_found' }, 404);
      const deps = runtime.createDeps({ db: c.env.DB });
      const rows = await deps.source.listBookmarkCandidates({ userId: auth.userId, examId: exam.code });
      const contents = await loadVersionContents(c.env.DB, rows.map((row) => row.version.questionVersionId));
      const items = [];
      for (const row of rows) {
        const content = contents.get(row.version.questionVersionId);
        if (!content) continue;
        items.push({ questionId: row.questionId, stem: content.stem, options: content.options.map((option) => ({ optionId: option.optionId, text: option.text })) });
      }
      return c.json({ examId: exam.code, total: items.length, items }, 200);
    } catch {
      return c.json({ error: 'internal' }, 500);
    }
  });
}
