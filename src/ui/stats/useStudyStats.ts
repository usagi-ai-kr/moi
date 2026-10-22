import { useQuery } from '@tanstack/react-query';
import { getStudyStats, type ApiClient } from '../api/client';

// 통계 쿼리 훅 — 헤더 진척도·요약·영역 화면이 사용자와 시험 단위로 공유한다 (#330·#353).
export const STUDY_STATS_KEY = ['study', 'stats'] as const;

export function studyStatsQueryKey(examId: string, userId: string) {
  return [...STUDY_STATS_KEY, examId, userId] as const;
}

export function useStudyStats(client: ApiClient, examId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: studyStatsQueryKey(examId, userId),
    queryFn: async () => {
      const stats = await getStudyStats(client, examId);
      if (stats.examId !== examId) throw new Error('학습 통계 응답의 시험 코드가 일치하지 않습니다.');
      return stats;
    },
    enabled: enabled && Boolean(examId && userId),
    retry: false,
    retryOnMount: false,
    // 요약·영역 탭은 fresh 구간 동안 같은 응답을 공유한다. 제출 후 invalidate와
    // 포커스/재연결 refetch로 다른 화면·탭에서 바뀐 진도는 다시 읽는다.
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
