import type { StudyHistoryPort } from '@/app/stats/ports';
import type { StudyHistoryEntry, StudyOutcome } from '@/domain/stats/types';

interface HistoryRow {
  readonly attempt_id: string;
  readonly exam_id: string;
  readonly question_id: string;
  readonly outcome: string;
  readonly occurred_at: number;
  readonly first_attempt: number | boolean | null;
  readonly domain_id: string;
}

const VALID_OUTCOMES: readonly StudyOutcome[] = ['correct', 'wrong', 'pass', 'unanswered'];

function toOutcome(raw: string): StudyOutcome {
  if ((VALID_OUTCOMES as readonly string[]).includes(raw)) return raw as StudyOutcome;
  throw new Error(`study_attempts: 알 수 없는 outcome: ${raw}`);
}

function toFirstAttempt(raw: HistoryRow['first_attempt']): boolean {
  return raw === true || raw === 1;
}

function toEntry(row: HistoryRow): StudyHistoryEntry {
  return {
    examId: row.exam_id,
    questionId: row.question_id,
    domainId: row.domain_id,
    outcome: toOutcome(row.outcome),
    occurredAt: row.occurred_at,
    firstAttempt: toFirstAttempt(row.first_attempt),
    attemptId: row.attempt_id,
  };
}

/**
 * study_attempts → StudyHistoryEntry[] D1 어댑터 (이슈 #54).
 * - questions JOIN으로 domainId를 함께 조회한다.
 * - 제외(excluded_at NOT NULL) 행은 통계 이력에서 제외한다.
 * - 잘못된 outcome은 throw한다(fail-closed).
 */
export function createD1StudyHistoryPort(db: D1Database): StudyHistoryPort {
  return {
    async load({ userId, examId }): Promise<StudyHistoryEntry[]> {
      const res = await db
        .prepare(
          'SELECT a.attempt_id AS attempt_id, a.exam_id AS exam_id, a.question_id AS question_id, ' +
            'a.outcome AS outcome, a.occurred_at AS occurred_at, a.first_attempt AS first_attempt, ' +
            'q.domain_id AS domain_id FROM study_attempts a JOIN questions q ON q.id = a.question_id ' +
            'WHERE a.user_id = ?1 AND a.exam_id = ?2 AND a.excluded_at IS NULL ' +
            'ORDER BY a.occurred_at ASC, a.attempt_id ASC',
        )
        .bind(userId, examId)
        .all<HistoryRow>();
      return (res.results ?? []).map(toEntry);
    },
  };
}
