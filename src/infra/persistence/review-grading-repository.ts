import type { ReviewGradingRepository } from '@/app/review/grading-ports';

/**
 * 복습 원자 채점 D1 어댑터(#54, ADR-0028).
 * - insert-first CAS: attempt INSERT(SELECT+EXISTS 구형 cursor) → 회차 UPDATE(CAS) 같은 batch.
 * - WHERE에 id/user/exam/mode/active/expectedCursor + 저장 스냅샷 items[expected]의 questionId/versionId(json_extract)를 넣어 소유·종료·stale·문제/개정 바꿔치기를 0행으로 거부한다.
 * - ON CONFLICT DO NOTHING 미사용 — UNIQUE 위반은 batch 실패로 롤백하고 false로 알린다(성공 위장 금지).
 * - firstAttempt는 트랜잭션 내 SQL로 산정한다(같은 user/exam/question 유효 correct/wrong 최초만 true, pass false).
 */
export function createD1ReviewGradingRepository(db: D1Database): ReviewGradingRepository {
  return {
    async commit({ session, expectedCursor, attempt }): Promise<boolean> {
      if (session.status !== 'active' || session.cursor !== expectedCursor + 1) return false;
      if (expectedCursor < 0 || expectedCursor >= session.items.length) return false;
      const item = session.items[expectedCursor];
      if (!item || item.state.kind !== 'graded') return false;
      if (item.questionId !== attempt.questionId || item.questionVersionId !== attempt.questionVersionId) return false;
      if (session.userId !== attempt.userId || session.examId !== attempt.examId) return false;
      if (attempt.attemptId === '' || !Number.isInteger(attempt.occurredAt)) return false;
      if (!Number.isInteger(expectedCursor)) return false;
      const qPath = `$[${expectedCursor}].questionId`;
      const vPath = `$[${expectedCursor}].questionVersionId`;
      const want = item.state.response.kind === 'pass' ? 'pass' : item.state.correct ? 'correct' : 'wrong';
      if (attempt.outcome !== want) return false;

      const insertStmt = db
        .prepare(
          'INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) ' +
            "SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'review', ?8, NULL, " +
            "CASE WHEN ?9 IN ('correct','wrong') AND NOT EXISTS " +
            "(SELECT 1 FROM study_attempts WHERE user_id = ?10 AND exam_id = ?11 AND question_id = ?12 " +
            "AND outcome IN ('correct','wrong') AND excluded_at IS NULL) THEN 1 ELSE 0 END " +
            "WHERE EXISTS (SELECT 1 FROM review_sessions WHERE id = ?13 AND user_id = ?14 AND exam_id = ?15 " +
            "AND mode = ?16 AND status = 'active' AND cursor = ?17 " +
            `AND json_extract(items, '${qPath}') = ?18 ` +
            `AND json_extract(items, '${vPath}') = ?19)`,
        )
        .bind(
          attempt.attemptId,
          attempt.userId,
          attempt.examId,
          attempt.questionId,
          attempt.questionVersionId,
          attempt.outcome,
          attempt.occurredAt,
          session.id,
          attempt.outcome,
          attempt.userId,
          attempt.examId,
          attempt.questionId,
          session.id,
          attempt.userId,
          attempt.examId,
          session.mode,
          expectedCursor,
          attempt.questionId,
          attempt.questionVersionId,
        );
      const updateStmt = db
        .prepare(
          'UPDATE review_sessions SET cursor = ?1, items = ?2 WHERE id = ?3 AND user_id = ?4 ' +
            "AND exam_id = ?5 AND mode = ?6 AND status = 'active' AND cursor = ?7 " +
            `AND json_extract(items, '${qPath}') = ?8 ` +
            `AND json_extract(items, '${vPath}') = ?9`,
        )
        .bind(
          session.cursor,
          JSON.stringify(session.items),
          session.id,
          session.userId,
          session.examId,
          session.mode,
          expectedCursor,
          attempt.questionId,
          attempt.questionVersionId,
        );
      let results: D1Result<unknown>[];
      try {
        results = await db.batch([insertStmt, updateStmt]);
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) return false;
        throw err;
      }
      const inserted = (results[0]?.meta as { changes?: number } | undefined)?.changes ?? 0;
      const updated = (results[1]?.meta as { changes?: number } | undefined)?.changes ?? 0;
      return inserted === 1 && updated === 1;
    },
  };
}
