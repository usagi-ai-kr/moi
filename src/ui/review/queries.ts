import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import { useSessionUser } from '../session';
import { REVIEW_CACHE_ROOT } from './cache-keys';
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

/**
 * 복습 캐시 키 (#314) — 후보·회차·북마크 모두 userId 를 포함해 계정 간 격리를 보장한다.
 * 키 구조(userId 포함)를 바꾸는 것이 수정 지점이다.
 */
export const reviewKeys = {
  candidates: (examId: string, mode: ReviewMode, userId = 'anonymous') =>
    [...REVIEW_CACHE_ROOT, 'candidates', userId, examId, mode] as const,
  current: (examId: string, mode: ReviewMode, userId = 'anonymous') =>
    [...REVIEW_CACHE_ROOT, 'current', userId, examId, mode] as const,
  bookmarks: (examId: string, userId = 'anonymous') =>
    [...REVIEW_CACHE_ROOT, 'bookmarks', userId, examId] as const,
};

/** 로그인 계정 id — 세션 미확인 중에는 'anonymous' 로 격리한다(#314). */
function useReviewUserId(client: ApiClient): string {
  const { user } = useSessionUser(client);
  return user?.id ?? 'anonymous';
}

export function useReviewCandidates(client: ApiClient, examId: string, mode: ReviewMode) {
  const userId = useReviewUserId(client);
  return useQuery({
    queryKey: reviewKeys.candidates(examId, mode, userId),
    queryFn: () => getReviewCandidates(client, examId, mode),
    retry: false,
    staleTime: 10_000,
  });
}

export function useCurrentReviewSession(client: ApiClient, examId: string, mode: ReviewMode) {
  const userId = useReviewUserId(client);
  return useQuery({
    queryKey: reviewKeys.current(examId, mode, userId),
    queryFn: () => getCurrentReviewSession(client, examId, mode),
    retry: false,
    staleTime: 5_000,
  });
}

export function useBookmarks(client: ApiClient, examId: string) {
  const userId = useReviewUserId(client);
  return useQuery({
    queryKey: reviewKeys.bookmarks(examId, userId),
    queryFn: () => listBookmarks(client, examId),
    retry: false,
    staleTime: 30_000,
  });
}

export function useStartReview(client: ApiClient) {
  const queryClient = useQueryClient();
  const userId = useReviewUserId(client);
  return useMutation({
    mutationFn: (input: { examId: string; mode: ReviewMode; size?: number }) =>
      startReviewSession(client, input.examId, input.mode, input.size),
    onSuccess: (data: ReviewSessionStartResponse, vars) => {
      queryClient.setQueryData(reviewKeys.current(vars.examId, vars.mode, userId), {
        ...data,
        exhausted: data.current === null,
      });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.candidates(vars.examId, vars.mode, userId) });
    },
  });
}

export function useSubmitReviewAnswer(client: ApiClient) {
  const queryClient = useQueryClient();
  const userId = useReviewUserId(client);
  return useMutation({
    mutationFn: (input: { examId: string; mode: ReviewMode; questionId: string; response: ReviewAnswerInputKind }) =>
      submitReviewAnswer(client, input),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.current(vars.examId, vars.mode, userId) });
    },
  });
}

export function useEndReview(client: ApiClient) {
  const queryClient = useQueryClient();
  const userId = useReviewUserId(client);
  return useMutation({
    mutationFn: (input: { examId: string; mode: ReviewMode }) =>
      endReviewSession(client, input.examId, input.mode),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData(reviewKeys.current(vars.examId, vars.mode, userId), null);
      void queryClient.invalidateQueries({ queryKey: reviewKeys.candidates(vars.examId, vars.mode, userId) });
    },
  });
}

export function useSetBookmark(client: ApiClient) {
  const queryClient = useQueryClient();
  const userId = useReviewUserId(client);
  return useMutation({
    mutationFn: (input: { examId: string; questionId: string; bookmarked: boolean }) =>
      setBookmark(client, input),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.bookmarks(vars.examId, userId) });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.candidates(vars.examId, 'bookmark', userId) });
    },
  });
}
