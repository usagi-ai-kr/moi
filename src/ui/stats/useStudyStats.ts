import { useQuery } from '@tanstack/react-query';
import { getStudyStats, type ApiClient } from '../api/client';

// 통계 쿼리 훅 — 사용자·시험별 응답을 분리하고 화면 복귀 시 재검증한다 (#330).
export const STUDY_STATS_KEY = ['study', 'stats'] as const;

export function studyStatsQueryKey(examId: string, userId: string) {
  return [...STUDY_STATS_KEY, examId, userId] as const;
}

export function useStudyStats(client: ApiClient, examId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: studyStatsQueryKey(examId, userId),
    queryFn: () => getStudyStats(client, examId),
    enabled,
    retry: false,
    // 요약·영역 탭은 fresh 구간 동안 같은 응답을 공유한다. 제출 후 invalidate와
    // 포커스/재연결 refetch로 다른 화면·탭에서 바뀐 진도는 다시 읽는다.
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
