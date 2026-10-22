import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { InvalidReviewQuestionError } from '@/app/review/errors';
import type { ReviewCandidateInput, ReviewSourcePort } from '@/app/review/ports';
import { questionOptions, questionVersions, questions } from './schema';
import { createD1ReviewExamResolver, type ResolvedReviewExam } from './review-exam-resolver';
import { reviewBookmarks } from './schema-review-bookmarks';

/**
 * D1 복습 소스 어댑터(#51).
 * - 오답 후보: 해당 계정·시험의 유효 attempt(wrong/pass/unanswered, excluded 제외) 집계.
 * - 북마크: 개인별 영속, 시험 격리·비활성 제외.
 * - 최신 활성 버전 매핑은 study-pool(#49) 기준을 재사용한다(도메인 규칙 재작성 금지).
 * - 브라우저 노출 없음 — Worker 전용.
 * - 시험 축 정규화(#51 버그픽스, ADR-0058): `study_attempts.exam_id`는 공개 코드
 *   ('saa-c03')로 저장되므로, 문제 조회만 내부 ID로 하고 시도 조회는 같은 시험의
 *   내부 ID·공개 코드를 모두 포함해 과거 내부 ID 데이터와 신규 코드 데이터를 함께 읽는다.
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

  async function resolveExam(examIdOrCode: string): Promise<ResolvedReviewExam | null> {
    return examResolver.resolve(examIdOrCode);
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
      const resolved = await resolveExam(examId);
      if (!resolved) return [];
      const active = await d1
        .select({ id: questions.id })
        .from(questions)
        .where(and(eq(questions.examId, resolved.id), eq(questions.status, 'active')));
      if (active.length === 0) return [];
      // 버전 매핑을 먼저 구해 "현재 버전" 기준 판정을 가능하게 한다(개정 문항은 현재 버전만).
      const { versionByQuestion, optionIdsByVersion } = await loadVersionMap(active.map((q) => q.id));
      // 시도 축 호환(ADR-0058): 입력값·내부 ID·공개 코드는 같은 시험이므로 함께 조회한다.
      // 정답 이력도 조회해 "최신 유효 시도가 correct 이면 제외"를 판정한다(#315).
      const attempts = await db
        .prepare(
          'SELECT question_id AS q, question_version_id AS v, outcome AS o, occurred_at AS t, attempt_id AS a ' +
            'FROM study_attempts WHERE user_id = ?1 AND exam_id IN (?2, ?3, ?4) AND excluded_at IS NULL',
        )
        .bind(userId, examId, resolved.id, resolved.code)
        .all<{ q: string; v: string; o: string; t: number; a: string }>();
      // 문항별 최신 시도(현재 버전만) 산출.
      const latestByQ = new Map<string, { outcome: string; occurredAt: number; attemptId: string }>();
      const currentWrongCount = new Map<string, number>();
      const hasAnyAttempt = new Set<string>();
      for (const r of attempts.results ?? []) {
        hasAnyAttempt.add(r.q);
        const currentVid = versionByQuestion.get(r.q)?.id;
        if (!currentVid || r.v !== currentVid) continue; // 개정 문항은 현재 버전 시도만 판정
        if (r.o === 'wrong' || r.o === 'pass' || r.o === 'unanswered') {
          currentWrongCount.set(r.q, (currentWrongCount.get(r.q) ?? 0) + 1);
        }
        const prev = latestByQ.get(r.q);
        if (!prev || r.t > prev.occurredAt || (r.t === prev.occurredAt && r.a > prev.attemptId)) {
          latestByQ.set(r.q, { outcome: r.o, occurredAt: r.t, attemptId: r.a });
        }
      }
      const targets: string[] = [];
      for (const q of active.map((q) => q.id)) {
        const latest = latestByQ.get(q);
        if (latest && latest.outcome === 'correct') continue; // 최신 유효 시도가 정답 → 제외
        // 현재 버전 시도가 없지만 개정 전 이력이 있는 문항은 후보(가중치 0)로 유지.
        // 시도 이력이 전혀 없는 문항은 기존처럼 제외한다.
        if (latest || hasAnyAttempt.has(q)) targets.push(q);
      }
      if (targets.length === 0) return [];
      const out: ReviewCandidateInput[] = [];
      for (const qid of [...targets].sort()) {
        const v = versionByQuestion.get(qid);
        if (!v) continue;
        out.push({
          questionId: qid,
          validWrongCount: currentWrongCount.get(qid) ?? 0,
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
      const resolved = await resolveExam(examId);
      if (!resolved) return [];
      const marks = await d1
        .select({ questionId: reviewBookmarks.questionId })
        .from(reviewBookmarks)
        .where(eq(reviewBookmarks.userId, userId));
      if (marks.length === 0) return [];
      const active = await d1
        .select({ id: questions.id })
        .from(questions)
        .where(and(eq(questions.examId, resolved.id), eq(questions.status, 'active')));
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
      const resolved = await resolveExam(examId);
      if (!resolved) throw new InvalidReviewQuestionError();
      const q = await d1
        .select({ id: questions.id, examId: questions.examId })
        .from(questions)
        .where(eq(questions.id, questionId))
        .limit(1);
      if (!q[0]) throw new InvalidReviewQuestionError();
      if (q[0].examId !== resolved.id) throw new InvalidReviewQuestionError();
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
