import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getStudyStats, type ApiClient } from '../api/client';

// 통계 쿼리 훅 — summary/domains 두 탭이 같은 키로 공유한다 (#224).
// 캐시 신선한 동안(≤30s) 탭 전환 간 재요청 0, 만료 후 정상 재검증은 허용.
export const STUDY_STATS_KEY = ['study', 'stats'] as const;

export function useStudyStats(client: ApiClient, examId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...STUDY_STATS_KEY, examId],
    queryFn: () => getStudyStats(client, examId),
    enabled,
    retry: false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
