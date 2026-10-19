import type { ReviewCandidatesResponse, ReviewMode } from '../api/review-client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { copy } from '../copy';

interface ReviewCandidatesProps {
  readonly data: ReviewCandidatesResponse | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly mode: ReviewMode;
  readonly isStarting: boolean;
  readonly onStart: () => void;
  readonly onRetry: () => void;
}

export function ReviewCandidates({
  data,
  isLoading,
  isError,
  mode,
  isStarting,
  onStart,
  onRetry,
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
            {copy.review.retry}
          </Button>
        </div>
      </Alert>
    );
  }

  if (data && data.total === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>{mode === 'wrong' ? copy.review.emptyWrong : copy.review.emptyBookmark}</p>
        </CardContent>
      </Card>
    );
  }

  if (data && data.total > 0) {
    return (
      <section aria-label="복습 대기 목록" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {copy.review.waitingPrefix} {data.total}
            {copy.review.waitingSuffix}
          </h2>
          <Button pending={isStarting} onClick={onStart}>
            {copy.review.startAction}
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {data.items.map((item, idx) => (
            <li key={item.questionId} className="rounded-lg border border-border bg-card p-4 text-card-foreground">
              <p className="text-sm font-medium">
                {idx + 1}. {item.stem}
              </p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return null;
}
