import type { Hono } from 'hono';
import { getReviewCandidatesView, startReviewSession } from '@/app/review';
import { isCrossSiteWrite, safeIssues } from './auth';
import { loadVersionContents } from './content';
import { toPendingDto } from './dto';
import { authedUser, matchesSnapshot, type ReviewRouteRuntimeOptions } from './support';
import { candidatesQuerySchema, startSessionBodySchema } from './schemas';

export function registerReviewCandidateRoutes(app: Hono<{ Bindings: Env }>, options: ReviewRouteRuntimeOptions): void {
  app.get('/api/review/candidates', async (c) => {
    c.header('Cache-Control', 'no-store');
    const { session, auth } = await authedUser(c, options.createSessionRuntime);
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('review_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const parsed = candidatesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
    try {
      const runtime = options.createRuntime(c.env, crypto.randomUUID());
      const exam = await runtime.resolveExam(parsed.data.examId);
      if (!exam) return c.json({ error: 'not_found' }, 404);
      const deps = runtime.createDeps({ db: c.env.DB });
      // 시험 축 정규화(#51, ADR-0058): 회차·시도는 공개 code('saa-c03')로 저장한다.
      // total은 queue plan된 remaining 개수(ADR-0059), items는 호환용 전체 목록이다.
      const view = await getReviewCandidatesView(deps, { userId: auth.userId, examId: exam.code, mode: parsed.data.mode });
      const contents = await loadVersionContents(c.env.DB, view.candidates.map((row) => row.version.questionVersionId));
      if (!matchesSnapshot(view.candidates.map((row) => ({ questionId: row.questionId, questionVersionId: row.version.questionVersionId })), contents)) {
        return c.json({ error: 'not_found' }, 404);
      }
      const items = [];
      for (const row of view.candidates) {
        const content = contents.get(row.version.questionVersionId);
        if (!content) continue;
        items.push({ questionId: row.questionId, validWrongCount: row.validWrongCount, stem: content.stem, options: content.options.map((option) => ({ optionId: option.optionId, text: option.text })) });
      }
      return c.json({ examId: exam.code, mode: parsed.data.mode, total: view.total, items }, 200);
    } catch {
      return c.json({ error: 'internal' }, 500);
    }
  });

  app.post('/api/review/sessions', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (isCrossSiteWrite(c)) return c.json({ error: 'forbidden' }, 403);
    const { session, auth } = await authedUser(c, options.createSessionRuntime);
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('review_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const parsed = startSessionBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'validation_failed', issues: safeIssues(parsed.error) }, 422);
    try {
      const runtime = options.createRuntime(c.env, crypto.randomUUID());
      const exam = await runtime.resolveExam(parsed.data.examId);
      if (!exam) return c.json({ error: 'not_found' }, 404);
      const deps = runtime.createDeps({ db: c.env.DB });
      const result = await startReviewSession(deps, { userId: auth.userId, examId: exam.code, mode: parsed.data.mode, size: parsed.data.size });
      if (result.outcome === 'rejected') {
        if (result.reason === 'active_session_exists') return c.json({ error: 'active_session_exists' }, 409);
        // invalid_size 는 사유를 그대로 노출한다(#268) — 후보 부족(no_candidates)과 구분된다.
        if (result.reason === 'invalid_size') return c.json({ error: 'invalid_size' }, 422);
        return c.json({ error: 'no_candidates' }, 422);
      }
      const contents = await loadVersionContents(c.env.DB, result.session.items.map((item) => item.questionVersionId));
      if (!matchesSnapshot(result.session.items, contents)) return c.json({ error: 'not_found' }, 404);
      const currentItem = result.session.items[0];
      const current = currentItem ? toPendingDto(currentItem, contents.get(currentItem.questionVersionId)) : null;
      return c.json({ examId: exam.code, mode: parsed.data.mode, status: 'active', cursor: 0, total: result.session.items.length, current, items: result.session.items.map((item) => toPendingDto(item, contents.get(item.questionVersionId))) }, 201);
    } catch (err) {
      if (err instanceof Error && /UNIQUE|active/i.test(err.message)) return c.json({ error: 'active_session_exists' }, 409);
      return c.json({ error: 'internal' }, 500);
    }
  });
}
