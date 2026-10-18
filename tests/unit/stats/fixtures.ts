import type { StudyHistoryEntry, StudyOutcome } from '@/domain/stats/types';

/**
 * 결정적 fixture (이슈 #54) — 외부 패키지·DB·네트워크 의존 없이 고정 시각 기반 이력을 만든다.
 * 기준 시각 NOW를 고정하고, 일·시간 단위 오프셋으로 occurredAt을 구성한다.
 */

export const EXAM = 'AWS-SAA-C03';
export const OTHER_EXAM = 'AWS-SAA-C04';

/** 기준 시각(고정) — 2026-10-18T00:00:00Z. */
export const NOW = Date.UTC(2026, 9, 18);
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface EntryInit {
  readonly questionId: string;
  readonly domainId: string;
  readonly outcome: StudyOutcome;
  readonly daysAgo?: number;
  readonly examId?: string;
  readonly firstAttempt?: boolean;
  readonly attemptId?: string;
}

export function entry(init: EntryInit): StudyHistoryEntry {
  const base: StudyHistoryEntry = {
    examId: init.examId ?? EXAM,
    questionId: init.questionId,
    domainId: init.domainId,
    outcome: init.outcome,
    occurredAt: NOW - (init.daysAgo ?? 0) * DAY_MS,
  };
  return {
    ...base,
    ...(init.firstAttempt !== undefined ? { firstAttempt: init.firstAttempt } : {}),
    ...(init.attemptId !== undefined ? { attemptId: init.attemptId } : {}),
  };
}

/**
 * 최초 풀이 100문제(정답 correctCount개) — coverage 100/500·정답률 검증용.
 * questionId q000~q099, 첫 100개 중 정답은 균등 분포(결정적).
 */
export function hundredFirstSolves(correctCount: number, domainId = 'security'): StudyHistoryEntry[] {
  return Array.from({ length: 100 }, (_, i) =>
    entry({
      questionId: `q${String(i).padStart(3, '0')}`,
      domainId,
      outcome: i < correctCount ? 'correct' : 'wrong',
      firstAttempt: true,
    }),
  );
}
