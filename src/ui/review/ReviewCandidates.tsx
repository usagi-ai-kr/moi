import { Link } from 'react-router';
import type { ReviewCandidatesResponse, ReviewMode } from '../api/review-client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { copy } from '../copy';
import { iconRefresh, iconStart } from '../icons';

interface ReviewCandidatesProps {
  readonly data: ReviewCandidatesResponse | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly mode: ReviewMode;
  readonly size?: number;
  readonly isStarting: boolean;
  readonly onStart: () => void;
  readonly onSize?: (n: number) => void;
  readonly onRetry: () => void;
  readonly onSelectMode?: (mode: ReviewMode) => void;
}

export function ReviewCandidates({
  data,
  isLoading,
  isError,
  mode,
  size,
  isStarting,
  onStart,
  onSize,
  onRetry,
  onSelectMode,
}: ReviewCandidatesProps) {
  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="error" className="flex flex-col gap-2">
        <p>{copy.review.loadError}</p>
        <div>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <iconRefresh.icon aria-hidden="true" size={iconRefresh.size} className="mr-1" />
            {copy.review.retry}
          </Button>
        </div>
      </Alert>
    );
  }

  if (data && data.total === 0) {
    const opposite: ReviewMode = mode === 'wrong' ? 'bookmark' : 'wrong';
    const oppositeLabel = mode === 'wrong' ? copy.review.goToBookmarkReview : copy.review.goToWrongReview;
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 py-8 text-center text-muted-foreground">
          <p>{mode === 'wrong' ? copy.review.emptyWrong : copy.review.emptyBookmark}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" asChild>
              <Link to="/study/new">{copy.review.goToStudy}</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => onSelectMode?.(opposite)}
            >
              {oppositeLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data && data.total > 0) {
    const selectedSize = size ?? 4;
    return (
      <section aria-label="복습 대기 목록" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            {copy.review.waitingPrefix} {data.total}
            {copy.review.waitingSuffix}
          </h2>
          <Button pending={isStarting} onClick={onStart}>
            <iconStart.icon aria-hidden="true" size={iconStart.size} className="mr-1" />
            {copy.review.startAction}
          </Button>
        </div>
        <fieldset className="flex flex-wrap gap-2" aria-label={copy.review.sizeLegend} disabled={isStarting}>
          {[4, 8].map((n) => (
            <label key={n} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1">
              <input type="radio" name="review-size" value={n} checked={selectedSize === n} onChange={() => onSize?.(n)} disabled={isStarting} className="h-5 w-5" />
              {copy.review.sizeOption(n)}
            </label>
          ))}
        </fieldset>
        {data.total < selectedSize && (
          <p className="text-sm text-muted-foreground">{copy.review.sizeAvailable(data.total)}</p>
        )}
        <p className="text-sm text-muted-foreground">{copy.review.roundHint}</p>
      </section>
    );
  }

  return null;
}
