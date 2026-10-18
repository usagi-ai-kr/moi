import type { ReportRepository } from '@/app/reports/ports';

/**
 * D1 신고 어댑터 (이슈 #53).
 * - `question_reports` insert, 버전·계정 UNIQUE 위반은 `duplicate`로 변환한다.
 * - 신고율 분모는 `submitted` 세트에 해당 버전이 든 고유 계정(JOIN `study_set_items`).
 */
export function createD1ReportRepository(db: D1Database): ReportRepository {
  return {
    async record({ id, questionId, questionVersionId, userId, reason, now }) {
      try {
        await db
          .prepare(
            'INSERT INTO question_reports (id, question_id, question_version_id, user_id, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
          )
          .bind(id, questionId, questionVersionId, userId, reason, now)
          .run();
        return 'recorded';
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) return 'duplicate';
        throw err;
      }
    },

    async getRate({ questionVersionId }) {
      const reporters = await db
        .prepare('SELECT COUNT(DISTINCT user_id) AS c FROM question_reports WHERE question_version_id = ?1')
        .bind(questionVersionId)
        .first<{ c: number }>();
      const solved = await db
        .prepare(
          "SELECT COUNT(DISTINCT s.user_id) AS c FROM study_sets s JOIN study_set_items i ON i.set_id = s.id WHERE s.status = 'submitted' AND i.question_version_id = ?1",
        )
        .bind(questionVersionId)
        .first<{ c: number }>();
      return { uniqueReporters: reporters?.c ?? 0, solvedUsers: solved?.c ?? 0 };
    },

    async ensureRecheckQueued({ questionVersionId, now }) {
      await db
        .prepare(
          "INSERT OR IGNORE INTO question_recheck_queue (question_version_id, status, attempts, updated_at) VALUES (?1, 'queued', 0, ?2)",
        )
        .bind(questionVersionId, now)
        .run();
    },
  };
}
