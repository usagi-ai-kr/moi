import { computeStudyStats } from '@/domain/stats/study-stats';
import { TOTAL_QUESTIONS_PER_EXAM } from '@/domain/stats/thresholds';
import type { StudyStats } from '@/domain/stats/types';
import type { StatsClock, StudyHistoryPort } from './ports';

/**
 * 학습 현황 use case (이슈 #54): 사용자/시험 이력 조회(Port) → 순수 계산(domain).
 * DB/HTTP/UI는 이 단위 범위 밖이다(브리프).
 */

export interface StudyStatsServiceDeps {
  readonly history: StudyHistoryPort;
  readonly clock: StatsClock;
}

export interface StudyStatsInput {
  readonly userId: string;
  readonly examId: string;
  /** 진도율 분모 — 기본 500(ADR-0019 전량). 시험별 문항 수가 다르면 주입한다. */
  readonly totalQuestions?: number;
}

export async function getStudyStats(deps: StudyStatsServiceDeps, input: StudyStatsInput): Promise<StudyStats> {
  const entries = await deps.history.load({ userId: input.userId, examId: input.examId });
  return computeStudyStats(entries, {
    examId: input.examId,
    totalQuestions: input.totalQuestions ?? TOTAL_QUESTIONS_PER_EXAM,
    now: deps.clock.now(),
  });
}
