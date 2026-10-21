import { useState } from 'react';
import type { ApiClient } from '../api/client';
import { Button } from '../components/ui/button';
import { copy } from '../copy';
import { iconBookmark, iconRefresh } from '../icons';
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
        {/* 설정/미설정을 아이콘 모양(채움 fill)으로 구분한다 — 색만으로 상태를 알리지 않는다(#260). */}
        <iconBookmark.icon
          aria-hidden="true"
          size={iconBookmark.size}
          fill={isBookmarked ? 'currentColor' : 'none'}
          className="mr-1"
        />
        {label}
      </Button>
      {errorMsg && (
        <span role="alert" className="text-sm text-destructive">
          {errorMsg}
        </span>
      )}
    </span>
  );
}
