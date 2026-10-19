import type { ReviewGradingRepository } from '@/app/review/grading-ports';

/**
 * 복습 원자 채점 D1 어댑터(#54, ADR-0038).
 * - INSERT 후보 → changes()=1일 때만 회차 UPDATE → UPDATE 0행이면 후보 attempt 삭제를 같은 batch로 실행한다.
 * - INSERT 0행은 UPDATE를 막고, CAS 조건은 id/user/exam/mode/active/cursor + 저장 스냅샷 questionId/versionId를 확인한다.
 * - UNIQUE/FK 등 INSERT 오류는 batch 전체를 롤백한다. firstAttempt는 트랜잭션 내 SQL로 산정한다.
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
      const statePath = `$[${expectedCursor}].state.kind`;
      const want = item.state.response.kind === 'pass' ? 'pass' : item.state.correct ? 'correct' : 'wrong';
      if (attempt.outcome !== want) return false;

      const insertStmt = db
        .prepare(
          'INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) ' +
            "SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'review', ?8, NULL, " +
            "CASE WHEN ?9 IN ('correct','wrong') AND NOT EXISTS " +
            '(SELECT 1 FROM study_attempts WHERE user_id = ?10 AND exam_id = ?11 AND question_id = ?12 ' +
            "AND outcome IN ('correct','wrong') AND excluded_at IS NULL) THEN 1 ELSE 0 END " +
            'WHERE EXISTS (SELECT 1 FROM review_sessions WHERE id = ?13 AND user_id = ?14 AND exam_id = ?15 ' +
            "AND mode = ?16 AND status = 'active' AND cursor = ?17 " +
            `AND json_extract(items, '${qPath}') = ?18 ` +
            `AND json_extract(items, '${vPath}') = ?19 ` +
            `AND json_extract(items, '${statePath}') = 'pending')`,
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
          'UPDATE review_sessions SET cursor = ?1, items = ?2 WHERE changes() = 1 AND id = ?3 AND user_id = ?4 ' +
            "AND exam_id = ?5 AND mode = ?6 AND status = 'active' AND cursor = ?7 " +
            `AND json_extract(items, '${qPath}') = ?8 ` +
            `AND json_extract(items, '${vPath}') = ?9 ` +
            `AND json_extract(items, '${statePath}') = 'pending'`,
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
      const cleanupStmt = db
        .prepare(
          "DELETE FROM study_attempts WHERE attempt_id = ?1 AND source = 'review' AND source_id = ?2 AND changes() = 0 " +
            'AND EXISTS (SELECT 1 FROM review_sessions WHERE id = ?2 AND user_id = ?3 AND exam_id = ?4 ' +
            "AND mode = ?5 AND status = 'active' AND cursor = ?6 " +
            `AND json_extract(items, '${qPath}') = ?7 ` +
            `AND json_extract(items, '${vPath}') = ?8 ` +
            `AND json_extract(items, '${statePath}') = 'pending')`,
        )
        .bind(
          attempt.attemptId,
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
        results = await db.batch([insertStmt, updateStmt, cleanupStmt]);
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) return false;
        throw err;
      }
      const inserted = (results[0]?.meta as { changes?: number } | undefined)?.changes ?? 0;
      const updated = (results[1]?.meta as { changes?: number } | undefined)?.changes ?? 0;
      const deleted = (results[2]?.meta as { changes?: number } | undefined)?.changes ?? 0;
      return inserted === 1 && updated === 1 && deleted === 0;
    },
  };
}
