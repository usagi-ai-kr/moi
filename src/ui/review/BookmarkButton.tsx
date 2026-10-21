import { useState } from 'react';
import type { ApiClient } from '../api/client';
import { Button } from '../components/ui/button';
import { copy } from '../copy';
import { iconBookmark, iconLoading, iconRefresh } from '../icons';
import { useSessionUser } from '../session';
import { useBookmarkOverrides, useBookmarks, useSetBookmark } from './bookmark-queries';

interface BookmarkButtonProps {
  readonly client: ApiClient;
  readonly examId: string;
  readonly questionId: string;
  readonly className?: string;
}

export function BookmarkButton({ client, examId, questionId, className }: BookmarkButtonProps) {
  const session = useSessionUser(client);
  const userId = session.user?.id ?? 'anonymous';
  const bookmarksQuery = useBookmarks(client, examId, userId);
  const bookmarkOverrides = useBookmarkOverrides(examId, userId);
  const setBookmarkMutation = useSetBookmark(client, examId, questionId, userId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<boolean | null>(null);

  const hasOverride = Object.prototype.hasOwnProperty.call(bookmarkOverrides.data, questionId);
  const hasBookmarkList = Array.isArray(bookmarksQuery.data?.items);
  const canDetermineStatus = hasOverride || (bookmarksQuery.isSuccess && hasBookmarkList);
  const isBookmarked = hasOverride
    ? bookmarkOverrides.data[questionId]
    : (Array.isArray(bookmarksQuery.data?.items) &&
      bookmarksQuery.data.items.some((item) => item.questionId === questionId));

  const handleMutation = (target: boolean) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBookmarkMutation.mutate(
      { examId, questionId, bookmarked: target },
      {
        onSuccess: (result) => {
          setRetryTarget(null);
          setSuccessMsg(result.bookmarked ? copy.review.bookmarkAdded : copy.review.bookmarkRemoved);
        },
        onError: () => {
          setRetryTarget(target);
          setErrorMsg(copy.review.bookmarkSaveError);
        },
      },
    );
  };

  const isSaving = setBookmarkMutation.isTargetPending;
  const isBusy = session.status === 'loading' || (!canDetermineStatus && !bookmarksQuery.isError) || isSaving;
  const isDisabled = isBusy || !canDetermineStatus;
  const label = isBookmarked ? copy.review.bookmarkRemove : copy.review.bookmarkAdd;

  if (bookmarksQuery.isError && !hasOverride) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={copy.review.bookmarkAdd}
          aria-busy={session.status === 'loading' || undefined}
          disabled
          className={`min-h-[44px] min-w-[44px] px-3 text-sm ${className ?? ''}`}
        >
          <iconBookmark.icon aria-hidden="true" size={iconBookmark.size} className="mr-1" />
          {copy.review.bookmarkAdd}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="북마크 다시 시도"
          onClick={() => void bookmarksQuery.refetch()}
          className="text-sm text-destructive hover:bg-muted"
        >
          <iconRefresh.icon aria-hidden="true" size={iconRefresh.size} className="mr-1" />
          {copy.review.retry}
        </Button>
      </span>
    );
  }

  const handleToggle = () => {
    if (isDisabled || !canDetermineStatus) return;
    handleMutation(!isBookmarked);
  };

  const handleRetry = () => {
    if (retryTarget === null || isSaving) return;
    handleMutation(retryTarget);
  };

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant={isBookmarked ? 'secondary' : 'outline'}
        aria-label={isSaving ? copy.review.bookmarkSaving : label}
        aria-pressed={isBookmarked}
        aria-busy={isBusy || undefined}
        disabled={isDisabled}
        className={`min-h-[44px] min-w-[44px] px-3 text-sm ${className ?? ''}`}
        onClick={handleToggle}
      >
        <span className="mr-1 inline-flex size-5 shrink-0 items-center justify-center">
          {isBusy ? (
            <iconLoading.icon aria-hidden="true" size={iconLoading.size} className="animate-spin" />
          ) : (
            <iconBookmark.icon
              aria-hidden="true"
              size={iconBookmark.size}
              fill={isBookmarked ? 'currentColor' : 'none'}
            />
          )}
        </span>
        {label}
      </Button>
      {successMsg && <span role="status" aria-live="polite" className="sr-only">{successMsg}</span>}
      {errorMsg && (
        <span role="alert" className="inline-flex basis-full flex-wrap items-center gap-1 text-sm text-destructive">
          <span>{errorMsg}</span>
          <Button type="button" size="sm" variant="ghost" onClick={handleRetry} disabled={isSaving}>
            {copy.review.retry}
          </Button>
        </span>
      )}
    </span>
  );
}
