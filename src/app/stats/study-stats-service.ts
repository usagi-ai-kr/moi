import { computeStudyStats } from '@/domain/stats/study-stats';
import type { StudyStats } from '@/domain/stats/types';
import type { StatsClock, StudyHistoryPort, StudyQuestionCountPort } from './ports';

/**
 * 학습 현황 use case (이슈 #54): 사용자/시험 이력 조회(Port) → 순수 계산(domain).
 * DB/HTTP/UI는 이 단위 범위 밖이다(브리프).
 */

export interface StudyStatsServiceDeps {
  readonly history: StudyHistoryPort;
  readonly questionCounts: StudyQuestionCountPort;
  readonly clock: StatsClock;
}

export interface StudyStatsInput {
  readonly userId: string;
  readonly examId: string;
}

export async function getStudyStats(deps: StudyStatsServiceDeps, input: StudyStatsInput): Promise<StudyStats> {
  const [entries, domainQuestionCounts] = await Promise.all([
    deps.history.load({ userId: input.userId, examId: input.examId }),
    deps.questionCounts.loadByDomain({ examId: input.examId }),
  ]);
  const totalQuestions = Object.values(domainQuestionCounts).reduce((total, count) => total + count, 0);
  return computeStudyStats(entries, {
    examId: input.examId,
    totalQuestions,
    domainQuestionCounts,
    now: deps.clock.now(),
  });
}
