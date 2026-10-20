import type { ApiClient } from '../api/client';
import type { ReviewAnswerResultGraded, ReviewOption } from '../api/review-client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { copy } from '../copy';
import { SourceLinks } from '../SourceLinks';
import { Explanation } from '../study/Explanation';
import { BookmarkButton } from './BookmarkButton';

interface ReviewFeedbackProps {
  readonly client: ApiClient;
  readonly examId: string;
  readonly questionId: string;
  readonly stem: string;
  readonly options: readonly ReviewOption[];
  readonly graded: ReviewAnswerResultGraded;
  readonly hasNext: boolean;
  readonly isEnding?: boolean;
  readonly endError?: string | null;
  readonly onNext: () => void;
  readonly onEnd: () => void;
}

export function ReviewFeedback({
  client,
  examId,
  questionId,
  stem,
  options,
  graded,
  hasNext,
  isEnding,
  endError,
  onNext,
  onEnd,
}: ReviewFeedbackProps) {
  const isPass =
    typeof graded.response === 'object' &&
    graded.response !== null &&
    (graded.response as { kind?: string }).kind === 'pass';

  return (
    <section aria-label="채점 피드백" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          {isPass ? (
            <span className="rounded bg-muted px-2.5 py-1 text-sm font-semibold text-muted-foreground">
              {copy.review.passBadge}
            </span>
          ) : graded.correct ? (
            <span className="rounded bg-success/15 px-2.5 py-1 text-sm font-semibold text-success">
              {copy.review.correctBadge}
            </span>
          ) : (
            <span className="rounded bg-destructive/15 px-2.5 py-1 text-sm font-semibold text-destructive">
              {copy.review.incorrectBadge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <BookmarkButton client={client} examId={examId} questionId={questionId} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEnd}
            disabled={Boolean(isEnding)}
            pending={Boolean(isEnding)}
            className="min-h-[44px]"
          >
            {copy.review.endAction}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold leading-relaxed md:text-lg">{stem}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {options.map((opt, idx) => {
              const isCorrectOption = graded.correctOptionIds?.includes(opt.optionId);
              return (
                <li
                  key={opt.optionId}
                  className={`flex min-h-[44px] items-center justify-between rounded-md border p-3 text-base ${
                    isCorrectOption
                      ? 'border-success/50 bg-success/10 font-semibold text-success-foreground'
                      : 'border-border bg-card text-card-foreground'
                  }`}
                >
                  <span>
                    {idx + 1}. {opt.text}
                  </span>
                  {isCorrectOption && (
                    <span className="text-xs font-bold text-success">✓ 정답</span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">{copy.study.explanation}</h3>
            <div className="text-base leading-relaxed text-muted-foreground">
              <Explanation markdown={graded.explanation || '—'} />
            </div>
          </div>

          {graded.sourceUrls && graded.sourceUrls.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground">{copy.review.sources}</h4>
              <SourceLinks urls={graded.sourceUrls} />
            </div>
          )}
        </CardContent>
      </Card>

      {endError && (
        <Alert variant="error" className="flex flex-col gap-2">
          <p className="text-sm font-medium">{endError}</p>
          <div>
            <Button type="button" size="sm" variant="outline" onClick={onEnd}>
              {copy.review.retry}
            </Button>
          </div>
        </Alert>
      )}

      <div className="flex justify-end pt-2">
        {hasNext ? (
          <Button type="button" variant="primary" onClick={onNext} className="min-h-[44px] px-6 text-base">
            {copy.review.next}
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            onClick={onEnd}
            disabled={Boolean(isEnding)}
            pending={Boolean(isEnding)}
            className="min-h-[44px] px-6 text-base"
          >
            {copy.review.endAction}
          </Button>
        )}
      </div>
    </section>
  );
}
