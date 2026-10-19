import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import {
  endReviewSession,
  getCurrentReviewSession,
  getReviewCandidates,
  listBookmarks,
  setBookmark,
  startReviewSession,
  submitReviewAnswer,
  type ReviewAnswerInputKind,
  type ReviewMode,
  type ReviewSessionStartResponse,
} from '../api/review-client';

export const reviewKeys = {
  candidates: (examId: string, mode: ReviewMode) => ['review', 'candidates', examId, mode] as const,
  current: (examId: string, mode: ReviewMode) => ['review', 'current', examId, mode] as const,
  bookmarks: (examId: string) => ['review', 'bookmarks', examId] as const,
};

export function useReviewCandidates(client: ApiClient, examId: string, mode: ReviewMode) {
  return useQuery({
    queryKey: reviewKeys.candidates(examId, mode),
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

export function useBookmarks(client: ApiClient, examId: string) {
  return useQuery({
    queryKey: reviewKeys.bookmarks(examId),
    queryFn: () => listBookmarks(client, examId),
    retry: false,
    staleTime: 30_000,
  });
}

export function useStartReview(client: ApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { examId: string; mode: ReviewMode }) =>
      startReviewSession(client, input.examId, input.mode),
    onSuccess: (data: ReviewSessionStartResponse, vars) => {
      queryClient.setQueryData(reviewKeys.current(vars.examId, vars.mode), {
        ...data,
        exhausted: data.current === null,
      });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.candidates(vars.examId, vars.mode) });
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
  return useMutation({
    mutationFn: (input: { examId: string; mode: ReviewMode }) =>
      endReviewSession(client, input.examId, input.mode),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData(reviewKeys.current(vars.examId, vars.mode), null);
      void queryClient.invalidateQueries({ queryKey: reviewKeys.candidates(vars.examId, vars.mode) });
    },
  });
}

export function useSetBookmark(client: ApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { examId: string; questionId: string; bookmarked: boolean }) =>
      setBookmark(client, input),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.bookmarks(vars.examId) });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.candidates(vars.examId, 'bookmark') });
    },
  });
}
