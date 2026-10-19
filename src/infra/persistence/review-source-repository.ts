import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { InvalidReviewQuestionError } from '@/app/review/errors';
import type { ReviewCandidateInput, ReviewSourcePort } from '@/app/review/ports';
import { questionOptions, questionVersions, questions } from './schema';
import { createD1ReviewExamResolver } from './review-exam-resolver';
import { reviewBookmarks } from './schema-review-bookmarks';

/**
 * D1 복습 소스 어댑터(#51).
 * - 오답 후보: 해당 계정·시험의 유효 attempt(wrong/pass/unanswered, excluded 제외) 집계.
 * - 북마크: 개인별 영속, 시험 격리·비활성 제외.
 * - 최신 활성 버전 매핑은 study-pool(#49) 기준을 재사용한다(도메인 규칙 재작성 금지).
 * - 브라우저 노출 없음 — Worker 전용.
 */
const IN_ARRAY_CHUNK_SIZE = 90;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function createD1ReviewSource(db: D1Database): ReviewSourcePort {
  const d1 = drizzle(db);
  const examResolver = createD1ReviewExamResolver(db);

  async function resolveExamId(examIdOrCode: string): Promise<string | null> {
    return (await examResolver.resolve(examIdOrCode))?.id ?? null;
  }

  async function loadVersionMap(questionIds: readonly string[]) {
    const versions: Array<typeof questionVersions.$inferSelect> = [];
    for (const ids of chunk(questionIds, IN_ARRAY_CHUNK_SIZE)) {
      if (ids.length === 0) continue;
      const rows = await d1.select().from(questionVersions).where(inArray(questionVersions.questionId, [...ids]));
      versions.push(...rows);
    }
    const active: Array<typeof questions.$inferSelect> = [];
    for (const ids of chunk(questionIds, IN_ARRAY_CHUNK_SIZE)) {
      if (ids.length === 0) continue;
      const rows = await d1.select().from(questions).where(inArray(questions.id, [...ids]));
      active.push(...rows);
    }
    const byId = new Map(active.map((q) => [q.id, q]));
    const versionByQuestion = new Map<string, (typeof versions)[number]>();
    for (const v of versions) {
      const q = byId.get(v.questionId);
      if (q && q.status === 'active' && q.currentVersionNo !== null && v.versionNo === q.currentVersionNo) {
        versionByQuestion.set(v.questionId, v);
      }
    }
    const versionIds = [...versionByQuestion.values()].map((v) => v.id);
    const options: Array<typeof questionOptions.$inferSelect> = [];
    for (const ids of chunk(versionIds, IN_ARRAY_CHUNK_SIZE)) {
      if (ids.length === 0) continue;
      const rows = await d1.select().from(questionOptions).where(inArray(questionOptions.questionVersionId, [...ids]));
      options.push(...rows);
    }
    const optionIdsByVersion = new Map<string, string[]>();
    for (const o of options) {
      const ids = optionIdsByVersion.get(o.questionVersionId) ?? [];
      ids.push(o.id);
      optionIdsByVersion.set(o.questionVersionId, ids);
    }
    return { versionByQuestion, optionIdsByVersion };
  }

  return {
    async listWrongCandidates({ userId, examId }): Promise<readonly ReviewCandidateInput[]> {
      const resolved = await resolveExamId(examId);
      if (!resolved) return [];
      const active = await d1
        .select({ id: questions.id })
        .from(questions)
        .where(and(eq(questions.examId, resolved), eq(questions.status, 'active')));
      if (active.length === 0) return [];
      const agg = await db
        .prepare(
          "SELECT question_id AS q, COUNT(*) AS c FROM study_attempts WHERE user_id = ?1 AND exam_id = ?2 AND outcome IN ('wrong','pass','unanswered') AND excluded_at IS NULL GROUP BY question_id",
        )
        .bind(userId, resolved)
        .all<{ q: string; c: number }>();
      const countByQ = new Map<string, number>();
      for (const r of agg.results ?? []) countByQ.set(r.q, r.c);
      const targets = active.map((q) => q.id).filter((id) => (countByQ.get(id) ?? 0) > 0);
      if (targets.length === 0) return [];
      const { versionByQuestion, optionIdsByVersion } = await loadVersionMap(targets);
      const out: ReviewCandidateInput[] = [];
      for (const qid of [...targets].sort()) {
        const v = versionByQuestion.get(qid);
        if (!v) continue;
        out.push({
          questionId: qid,
          validWrongCount: countByQ.get(qid) ?? 0,
          version: {
            questionVersionId: v.id,
            versionNo: v.versionNo,
            optionIds: optionIdsByVersion.get(v.id) ?? [],
            answerOptionIds: v.answerOptionIds,
          },
        });
      }
      return out;
    },

    async listBookmarkCandidates({ userId, examId }): Promise<readonly ReviewCandidateInput[]> {
      const resolved = await resolveExamId(examId);
      if (!resolved) return [];
      const marks = await d1
        .select({ questionId: reviewBookmarks.questionId })
        .from(reviewBookmarks)
        .where(eq(reviewBookmarks.userId, userId));
      if (marks.length === 0) return [];
      const active = await d1
        .select({ id: questions.id })
        .from(questions)
        .where(and(eq(questions.examId, resolved), eq(questions.status, 'active')));
      const activeSet = new Set(active.map((q) => q.id));
      const targets = marks.map((m) => m.questionId).filter((id) => activeSet.has(id));
      if (targets.length === 0) return [];
      const { versionByQuestion, optionIdsByVersion } = await loadVersionMap(targets);
      const out: ReviewCandidateInput[] = [];
      for (const qid of [...targets].sort()) {
        const v = versionByQuestion.get(qid);
        if (!v) continue;
        out.push({
          questionId: qid,
          validWrongCount: 0,
          version: {
            questionVersionId: v.id,
            versionNo: v.versionNo,
            optionIds: optionIdsByVersion.get(v.id) ?? [],
            answerOptionIds: v.answerOptionIds,
          },
        });
      }
      return out;
    },

    async toggleBookmark({ userId, questionId }): Promise<{ bookmarked: boolean }> {
      const q = await d1.select({ id: questions.id }).from(questions).where(eq(questions.id, questionId)).limit(1);
      if (!q[0]) throw new Error(`북마크 대상 문제가 없다: ${questionId}`);
      const existing = await d1
        .select({ questionId: reviewBookmarks.questionId })
        .from(reviewBookmarks)
        .where(and(eq(reviewBookmarks.userId, userId), eq(reviewBookmarks.questionId, questionId)))
        .limit(1);
      if (existing[0]) {
        await d1
          .delete(reviewBookmarks)
          .where(and(eq(reviewBookmarks.userId, userId), eq(reviewBookmarks.questionId, questionId)));
        return { bookmarked: false };
      }
      try {
        await d1.insert(reviewBookmarks).values({ userId, questionId, createdAt: Math.floor(Date.now() / 1000) });
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) return { bookmarked: true };
        throw err;
      }
      return { bookmarked: true };
    },

    async setBookmark({ userId, examId, questionId, bookmarked }): Promise<{ bookmarked: boolean }> {
      const resolved = await resolveExamId(examId);
      if (!resolved) throw new InvalidReviewQuestionError();
      const q = await d1
        .select({ id: questions.id, examId: questions.examId })
        .from(questions)
        .where(eq(questions.id, questionId))
        .limit(1);
      if (!q[0]) throw new InvalidReviewQuestionError();
      if (q[0].examId !== resolved) throw new InvalidReviewQuestionError();
      if (bookmarked) {
        try {
          await db
            .prepare('INSERT OR IGNORE INTO review_bookmarks (user_id, question_id, created_at) VALUES (?1, ?2, ?3)')
            .bind(userId, questionId, Math.floor(Date.now() / 1000))
            .run();
        } catch (err) {
          if (err instanceof Error && /FOREIGN KEY/i.test(err.message)) throw new InvalidReviewQuestionError();
          throw err;
        }
        return { bookmarked: true };
      }
      await d1
        .delete(reviewBookmarks)
        .where(and(eq(reviewBookmarks.userId, userId), eq(reviewBookmarks.questionId, questionId)));
      return { bookmarked: false };
    },
  };
}
