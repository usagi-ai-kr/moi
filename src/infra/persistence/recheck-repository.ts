import type { RecheckRepository } from '@/app/reports/recheck-port';
import { finishRecheck, startRecheck } from '@/domain/reports/recheck';
import type { RecheckState, RecheckStatus } from '@/domain/reports/types';

interface RecheckRow {
  readonly status: string;
  readonly attempts: number;
  readonly last_attempt_at: number | null;
  readonly started_at: number | null;
}

function toState(row: RecheckRow): RecheckState {
  return {
    status: row.status as RecheckStatus,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at,
    startedAt: row.started_at,
  };
}

/**
 * D1 재검수 큐 어댑터 (이슈 #53).
 * - 순수 전이(`startRecheck`/`finishRecheck`) 후 조건부 UPDATE로 경합을 감지한다.
 * - `updated_at`은 전이 시각(now). 성공·실패 모두 반영한다.
 */
export function createD1RecheckRepository(db: D1Database): RecheckRepository {
  async function find(versionId: string): Promise<RecheckState | null> {
    const row = await db
      .prepare(
        'SELECT status, attempts, last_attempt_at, started_at FROM question_recheck_queue WHERE question_version_id = ?1',
      )
      .bind(versionId)
      .first<RecheckRow>();
    return row === null ? null : toState(row);
  }

  return {
    find,

    async start({ versionId, now }) {
      const current = await find(versionId);
      if (current === null) return null;
      const next = startRecheck(current, { now });
      if (next === null) return null;
      const result = await db
        .prepare(
          'UPDATE question_recheck_queue SET status = ?1, attempts = ?2, started_at = ?3, updated_at = ?4 WHERE question_version_id = ?5 AND status = ?6 AND attempts = ?7 AND last_attempt_at IS ?8',
        )
        .bind(next.status, next.attempts, next.startedAt, now, versionId, current.status, current.attempts, current.lastAttemptAt)
        .run();
      const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
      return changes === 1 ? next : null;
    },

    async finish({ versionId, now, outcome }) {
      const current = await find(versionId);
      if (current === null) return null;
      const next = finishRecheck(current, { now, outcome });
      if (next === null) return null;
      const result = await db
        .prepare(
          "UPDATE question_recheck_queue SET status = ?1, last_attempt_at = ?2, updated_at = ?3 WHERE question_version_id = ?4 AND status = 'running' AND started_at IS ?5",
        )
        .bind(next.status, next.lastAttemptAt, now, versionId, current.startedAt)
        .run();
      const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
      return changes === 1 ? next : null;
    },
  };
}
