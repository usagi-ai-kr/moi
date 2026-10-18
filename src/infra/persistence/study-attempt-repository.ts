import { and, asc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { AttemptRecord, StudyAttemptRepository } from '@/app/stats/attempt-ports';
import { studyAttempts } from './schema-attempts';

type AttemptRow = typeof studyAttempts.$inferSelect;

function toRecord(row: AttemptRow): AttemptRecord {
  return {
    attemptId: row.attemptId,
    userId: row.userId,
    examId: row.examId,
    questionId: row.questionId,
    questionVersionId: row.questionVersionId,
    outcome: row.outcome,
    occurredAt: row.occurredAt,
    source: row.source,
    sourceId: row.sourceId,
    excludedAt: row.excludedAt,
    firstAttempt: row.firstAttempt,
  };
}

/**
 * study_attempts D1 어댑터 (이슈 #54, ADR-0025).
 * - recordBatch는 모든 충돌(PK attemptId·UNIQUE(source, sourceId, questionId))을 무시한다(멱등).
 * - firstAttempt 계산은 하지 않고 그대로 저장한다.
 */
export function createD1StudyAttemptRepository(db: D1Database): StudyAttemptRepository {
  const d1 = drizzle(db);

  return {
    async recordBatch({ attempts }) {
      if (attempts.length === 0) return;
      await d1
        .insert(studyAttempts)
        .values(
          attempts.map((a) => ({
            attemptId: a.attemptId,
            userId: a.userId,
            examId: a.examId,
            questionId: a.questionId,
            questionVersionId: a.questionVersionId,
            outcome: a.outcome,
            occurredAt: a.occurredAt,
            source: a.source,
            sourceId: a.sourceId,
            excludedAt: a.excludedAt,
            firstAttempt: a.firstAttempt,
          })),
        )
        .onConflictDoNothing();
    },

    async hasGradedAttempt({ userId, examId, questionId }) {
      const rows = await d1
        .select({ outcome: studyAttempts.outcome })
        .from(studyAttempts)
        .where(
          and(
            eq(studyAttempts.userId, userId),
            eq(studyAttempts.examId, examId),
            eq(studyAttempts.questionId, questionId),
            isNull(studyAttempts.excludedAt),
          ),
        );
      return rows.some((r) => r.outcome === 'correct' || r.outcome === 'wrong');
    },

    async listByUserExam({ userId, examId }) {
      const rows = await d1
        .select()
        .from(studyAttempts)
        .where(and(eq(studyAttempts.userId, userId), eq(studyAttempts.examId, examId)))
        .orderBy(asc(studyAttempts.occurredAt), asc(studyAttempts.attemptId));
      return rows.map(toRecord);
    },

    async excludeSetVersion({ userId, setId, questionVersionId, now }) {
      const res = await d1
        .update(studyAttempts)
        .set({ excludedAt: now })
        .where(
          and(
            eq(studyAttempts.source, 'set'),
            eq(studyAttempts.sourceId, setId),
            eq(studyAttempts.userId, userId),
            eq(studyAttempts.questionVersionId, questionVersionId),
          ),
        );
      return (res.meta as { changes?: number } | undefined)?.changes ?? 0;
    },
  };
}
