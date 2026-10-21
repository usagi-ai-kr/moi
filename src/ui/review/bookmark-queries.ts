import { useEffect } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import { listBookmarks, setBookmark, type BookmarkSetResponse } from '../api/review-client';
import { reviewKeys } from './queries';

export function useBookmarks(client: ApiClient, examId: string, userId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: reviewKeys.bookmarks(examId, userId),
    queryFn: () => listBookmarks(client, examId),
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!query.isSuccess || query.isFetching || !Array.isArray(query.data?.items)) return;
    const overrideKey = reviewKeys.bookmarkOverrides(examId, userId);
    const previous = queryClient.getQueryData<Record<string, boolean>>(overrideKey);
    if (!previous) return;
    const bookmarkedIds = new Set(query.data.items.map((item) => item.questionId));
    const reconciled = Object.fromEntries(
      Object.keys(previous).map((questionId) => [questionId, bookmarkedIds.has(questionId)]),
    );
    if (Object.keys(previous).some((questionId) => previous[questionId] !== reconciled[questionId])) {
      queryClient.setQueryData(overrideKey, reconciled);
    }
  }, [examId, query.data, query.dataUpdatedAt, query.isFetching, query.isSuccess, queryClient, userId]);

  return query;
}

export function useBookmarkOverrides(examId: string, userId: string) {
  return useQuery<Record<string, boolean>>({
    queryKey: reviewKeys.bookmarkOverrides(examId, userId),
    queryFn: async () => ({}),
    initialData: {},
    enabled: false,
  });
}

export function useSetBookmark(client: ApiClient, examId: string, questionId: string, userId: string) {
  const queryClient = useQueryClient();
  const mutationKey = reviewKeys.bookmarkMutation(examId, questionId, userId);
  const mutation = useMutation({
    mutationKey,
    scope: { id: JSON.stringify(mutationKey) },
    mutationFn: async (input: { examId: string; questionId: string; bookmarked: boolean }) => {
      const result = await setBookmark(client, input);
      if (result.questionId !== input.questionId || result.bookmarked !== input.bookmarked) {
        throw new Error('bookmark-state-mismatch');
      }
      return result;
    },
    onSuccess: (result: BookmarkSetResponse, vars) => {
      queryClient.setQueryData<Record<string, boolean>>(
        reviewKeys.bookmarkOverrides(vars.examId, userId),
        (previous) => ({ ...previous, [result.questionId]: result.bookmarked }),
      );
    },
    onSettled: async (_data, _error, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewKeys.bookmarks(vars.examId, userId) }),
        queryClient.invalidateQueries({ queryKey: reviewKeys.candidates(vars.examId, 'bookmark', userId) }),
      ]);
    },
  });
  const pendingCount = useIsMutating({ mutationKey, exact: true });
  return { ...mutation, isTargetPending: pendingCount > 0 };
}

