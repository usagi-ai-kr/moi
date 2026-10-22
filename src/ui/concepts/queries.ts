import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import { getConceptDetail, getConceptRecommendations } from '../api/concept-client';

export const CONCEPT_CACHE_ROOT = ['concepts'] as const;

export const conceptKeys = {
  recommendations: (examId: string, userId: string) => [...CONCEPT_CACHE_ROOT, 'recommendations', userId, examId] as const,
  detail: (examId: string, userId: string, conceptId: string) => [...CONCEPT_CACHE_ROOT, 'detail', userId, examId, conceptId] as const,
};

export function useConceptRecommendations(client: ApiClient, examId: string, userId: string) {
  return useQuery({
    queryKey: conceptKeys.recommendations(examId, userId),
    queryFn: () => getConceptRecommendations(client, examId),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useConceptDetail(client: ApiClient, examId: string, userId: string, conceptId: string | null) {
  return useQuery({
    queryKey: conceptId ? conceptKeys.detail(examId, userId, conceptId) : [...CONCEPT_CACHE_ROOT, 'detail', userId, examId, 'none'],
    queryFn: () => getConceptDetail(client, examId, conceptId as string),
    enabled: conceptId !== null,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
