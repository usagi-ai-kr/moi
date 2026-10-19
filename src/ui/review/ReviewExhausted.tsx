import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { copy } from '../copy';

interface ReviewExhaustedProps {
  readonly isEnding: boolean;
  readonly endError: string | null;
  readonly onEnd: () => void;
  readonly onRetryEnd?: () => void;
}

export function ReviewExhausted({ isEnding, endError, onEnd, onRetryEnd }: ReviewExhaustedProps) {
  return (
    <section aria-label="복습 소진 상태" className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{copy.review.exhaustedTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{copy.review.exhaustedDescription}</p>
          {endError && (
            <Alert variant="error" className="flex flex-col gap-2">
              <p className="text-sm">{endError}</p>
              <div>
                <Button size="sm" variant="outline" onClick={onRetryEnd ?? onEnd}>
                  {copy.review.retry}
                </Button>
              </div>
            </Alert>
          )}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="primary"
              pending={isEnding}
              disabled={isEnding}
              onClick={onEnd}
              className="min-h-[44px] px-6 text-base"
            >
              {copy.review.endAction}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
