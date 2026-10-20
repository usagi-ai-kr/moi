import type { Hono } from 'hono';
import { answerReviewItem } from '@/app/review';
import { safeIssues, isCrossSiteWrite } from './auth';
import { loadVersionContents } from './content';
import { toPendingDto } from './dto';
import { authedUser, matchesSnapshot, type ReviewRouteRuntimeOptions } from './support';
import { answerBodySchema } from './schemas';

export function registerReviewAnswerRoutes(app: Hono<{ Bindings: Env }>, options: ReviewRouteRuntimeOptions): void {
  app.post('/api/review/sessions/current/answers', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (isCrossSiteWrite(c)) return c.json({ error: 'forbidden' }, 403);
    const { session, auth } = await authedUser(c, options.createSessionRuntime);
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('review_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const parsed = answerBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
    try {
      const runtime = options.createRuntime(c.env, crypto.randomUUID());
      const exam = await runtime.resolveExam(parsed.data.examId);
      if (!exam) return c.json({ error: 'not_found' }, 404);
      const deps = runtime.createDeps({ db: c.env.DB });
      const active = await deps.repository.findActive({ userId: auth.userId, examId: exam.code, mode: parsed.data.mode });
      if (!active) return c.json({ error: 'not_found' }, 404);
      const expectedCursor = active.cursor;
      const contents = await loadVersionContents(c.env.DB, active.items.map((item) => item.questionVersionId));
      if (!matchesSnapshot(active.items, contents)) return c.json({ error: 'not_found' }, 404);
      const result = await answerReviewItem(deps, {
        userId: auth.userId,
        examId: exam.code,
        mode: parsed.data.mode,
        questionId: parsed.data.questionId,
        response: parsed.data.response,
        expectedCursor,
      });
      if (result.outcome === 'rejected') {
        if (result.reason === 'not_found') return c.json({ error: 'not_found' }, 404);
        if (result.reason === 'unknown_option') return c.json({ error: 'unknown_option' }, 422);
        return c.json({ error: result.reason }, 409);
      }
      const gradedItem = result.session.items.find((item) =>
        item.questionId === result.attempt.questionId &&
        item.questionVersionId === result.attempt.questionVersionId &&
        item.state.kind === 'graded',
      );
      const content = contents.get(result.attempt.questionVersionId);
      if (!gradedItem || gradedItem.state.kind !== 'graded' || !content || content.questionId !== result.attempt.questionId) {
        return c.json({ error: 'conflict' }, 409);
      }
      const nextItem = result.session.items[result.session.cursor];
      const next = nextItem ? toPendingDto(nextItem, contents.get(nextItem.questionVersionId)) : null;
      return c.json({
        correct: result.correct,
        graded: {
          questionId: result.attempt.questionId,
          response: result.attempt.response,
          correct: result.correct,
          explanation: content.explanation,
          sourceUrls: [...content.sourceUrls],
          correctOptionIds: [...gradedItem.answerOptionIds],
        },
        session: { examId: exam.code, mode: parsed.data.mode, status: result.session.status, cursor: result.session.cursor, total: result.session.items.length },
        next,
      }, 200);
    } catch {
      return c.json({ error: 'internal' }, 500);
    }
  });
}
