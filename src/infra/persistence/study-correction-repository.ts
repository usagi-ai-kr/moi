import type { CorrectionRepository } from '@/app/reports/correction-ports';

interface CorrectionRow {
  readonly id: string;
  readonly set_id: string;
  readonly question_id: string;
  readonly question_version_id: string;
  readonly reason: string;
  readonly source: string;
  readonly actor: string;
  readonly created_at: number;
}

/**
 * 정정 이벤트 D1 어댑터 (이슈 #53).
 * - `study_corrections` insert, (set_id, question_version_id) UNIQUE 위반은 `duplicate`로 변환한다.
 * - list는 set 단위 createdAt asc, id asc 순서를 보장한다. 정정 적용·재계산은 범위 밖.
 */
export function createD1CorrectionRepository(db: D1Database): CorrectionRepository {
  return {
    async record({ id, setId, questionId, questionVersionId, reason, source, actor, createdAt }) {
      try {
        await db
          .prepare(
            "INSERT INTO study_corrections (id, set_id, question_id, question_version_id, reason, source, actor, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE(?7, 'system'), ?8)",
          )
          .bind(id, setId, questionId, questionVersionId, reason, source, actor ?? null, createdAt)
          .run();
        return 'recorded';
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) return 'duplicate';
        throw err;
      }
    },

    async listBySet(setId) {
      const res = await db
        .prepare(
          'SELECT id, set_id, question_id, question_version_id, reason, source, actor, created_at FROM study_corrections WHERE set_id = ?1 ORDER BY created_at ASC, id ASC',
        )
        .bind(setId)
        .all<CorrectionRow>();
      return res.results.map((r) => ({
        id: r.id,
        setId: r.set_id,
        questionId: r.question_id,
        questionVersionId: r.question_version_id,
        reason: r.reason,
        source: r.source,
        actor: r.actor,
        createdAt: r.created_at,
      }));
    },
  };
}
