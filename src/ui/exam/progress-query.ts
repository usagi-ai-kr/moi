import type { ApiClient, StudyStats } from '../api/client';
import { STUDY_STATS_KEY, studyStatsQueryKey, useStudyStats } from '../stats/useStudyStats';

// 헤더 링과 통계 탭은 같은 서버 DTO·캐시를 사용한다.
export const EXAM_PROGRESS_QUERY_ROOT = STUDY_STATS_KEY;

export function examProgressQueryKey(examId: string, userId: string) {
  return studyStatsQueryKey(examId, userId);
}

export function toExamProgressPercent(
  stats: Pick<StudyStats, 'examId' | 'coverage' | 'totalQuestions'> | undefined,
  examId: string,
) {
  if (!stats || stats.examId !== examId) return null;
  if (typeof stats.totalQuestions !== 'number' || !Number.isFinite(stats.totalQuestions) || stats.totalQuestions <= 0) {
    return null;
  }
  const coverage: unknown = stats.coverage;
  if (typeof coverage !== 'number' || !Number.isFinite(coverage) || coverage < 0 || coverage > 1) return null;
  return Math.round(coverage * 1000) / 10;
}

export function useExamProgress(client: ApiClient, examId: string, userId: string) {
  return useStudyStats(client, examId, userId, true);
}
