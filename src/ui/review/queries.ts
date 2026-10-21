import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import { useSessionUser } from '../session';
import {
  endReviewSession,
  getCurrentReviewSession,
  getReviewCandidates,
  startReviewSession,
  submitReviewAnswer,
  type ReviewAnswerInputKind,
  type ReviewMode,
  type ReviewSessionStartResponse,
} from '../api/review-client';

export const reviewKeys = {
  candidates: (examId: string, mode: ReviewMode, userId = 'anonymous') =>
    mode === 'bookmark'
      ? (['review', 'candidates', userId, examId, mode] as const)
      : (['review', 'candidates', examId, mode] as const),
  current: (examId: string, mode: ReviewMode) => ['review', 'current', examId, mode] as const,
  bookmarks: (examId: string, userId = 'anonymous') => ['review', 'bookmarks', userId, examId] as const,
  bookmarkOverrides: (examId: string, userId = 'anonymous') => ['review', 'bookmark-overrides', userId, examId] as const,
  bookmarkMutation: (examId: string, questionId: string, userId = 'anonymous') =>
    ['review', 'set-bookmark', userId, examId, questionId] as const,
};

export function useReviewCandidates(client: ApiClient, examId: string, mode: ReviewMode) {
  const { user } = useSessionUser(client);
  const userId = user?.id ?? 'anonymous';
  return useQuery({
    queryKey: reviewKeys.candidates(examId, mode, userId),
    queryFn: () => getReviewCandidates(client, examId, mode),
    retry: false,
    staleTime: 10_000,
  });
}

export function useCurrentReviewSession(client: ApiClient, examId: string, mode: ReviewMode) {
  return useQuery({
    queryKey: reviewKeys.current(examId, mode),
    queryFn: () => getCurrentReviewSession(client, examId, mode),
    retry: false,
    staleTime: 5_000,
  });
}

export function useStartReview(client: ApiClient) {
  const queryClient = useQueryClient();
  const { user } = useSessionUser(client);
  const userId = user?.id ?? 'anonymous';
  return useMutation({
    mutationFn: (input: { examId: string; mode: ReviewMode; size?: number }) =>
      startReviewSession(client, input.examId, input.mode, input.size),
    onSuccess: (data: ReviewSessionStartResponse, vars) => {
      queryClient.setQueryData(reviewKeys.current(vars.examId, vars.mode), {
        ...data,
        exhausted: data.current === null,
      });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.candidates(vars.examId, vars.mode, userId) });
    },
  });
}

export function useSubmitReviewAnswer(client: ApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { examId: string; mode: ReviewMode; questionId: string; response: ReviewAnswerInputKind }) =>
      submitReviewAnswer(client, input),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.current(vars.examId, vars.mode) });
    },
  });
}

export function useEndReview(client: ApiClient) {
  const queryClient = useQueryClient();
  const { user } = useSessionUser(client);
  const userId = user?.id ?? 'anonymous';
  return useMutation({
    mutationFn: (input: { examId: string; mode: ReviewMode }) =>
      endReviewSession(client, input.examId, input.mode),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData(reviewKeys.current(vars.examId, vars.mode), null);
      void queryClient.invalidateQueries({ queryKey: reviewKeys.candidates(vars.examId, vars.mode, userId) });
    },
  });
}
