import { useState } from 'react';
import type { ApiClient } from '../api/client';
import { Button } from '../components/ui/button';
import { copy } from '../copy';
import { useBookmarks, useSetBookmark } from './queries';

interface BookmarkButtonProps {
  readonly client: ApiClient;
  readonly examId: string;
  readonly questionId: string;
  readonly className?: string;
}

export function BookmarkButton({ client, examId, questionId, className }: BookmarkButtonProps) {
  const bookmarksQuery = useBookmarks(client, examId);
  const setBookmarkMutation = useSetBookmark(client);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (bookmarksQuery.isError) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={copy.review.bookmarkAdd}
          disabled
          className={`min-h-[44px] min-w-[44px] px-3 text-sm ${className ?? ''}`}
        >
          <span aria-hidden="true" className="mr-1">
            ☆
          </span>
          {copy.review.bookmarkAdd}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="북마크 다시 시도"
          onClick={() => void bookmarksQuery.refetch()}
          className="text-xs text-destructive hover:bg-muted"
        >
          {copy.review.retry}
        </Button>
      </span>
    );
  }

  const isBookmarked =
    Array.isArray(bookmarksQuery.data?.items)
      ? bookmarksQuery.data.items.some((item) => item.questionId === questionId)
      : false;

  const handleToggle = () => {
    if (!bookmarksQuery.isSuccess) return;
    setErrorMsg(null);
    setBookmarkMutation.mutate(
      { examId, questionId, bookmarked: !isBookmarked },
      {
        onError: () => {
          setErrorMsg(copy.review.retry);
        },
      },
    );
  };

  const label = isBookmarked ? copy.review.bookmarkRemove : copy.review.bookmarkAdd;
  const isPending = bookmarksQuery.isLoading || !bookmarksQuery.data || setBookmarkMutation.isPending;

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant={isBookmarked ? 'secondary' : 'outline'}
        aria-label={label}
        aria-pressed={isBookmarked}
        aria-busy={isPending}
        disabled={isPending}
        className={`min-h-[44px] min-w-[44px] px-3 text-sm ${className ?? ''}`}
        onClick={handleToggle}
      >
        <span aria-hidden="true" className="mr-1">
          {isBookmarked ? '★' : '☆'}
        </span>
        {label}
      </Button>
      {errorMsg && (
        <span role="alert" className="text-xs text-destructive">
          {errorMsg}
        </span>
      )}
    </span>
  );
}
