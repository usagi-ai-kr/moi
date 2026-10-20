import type { ApiClient } from '../api/client';
import type { ReviewPendingItem } from '../api/review-client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { copy } from '../copy';
import { BookmarkButton } from './BookmarkButton';

interface ReviewQuestionProps {
  readonly client: ApiClient;
  readonly examId: string;
  readonly item: ReviewPendingItem;
  readonly cursor: number;
  readonly total: number;
  readonly selectedOptions: readonly string[];
  readonly isSubmitting: boolean;
  readonly isEnding?: boolean;
  readonly errorMsg: string | null;
  readonly endError?: string | null;
  readonly onToggleOption: (optionId: string) => void;
  readonly onSubmit: () => void;
  readonly onPass: () => void;
  readonly onEnd: () => void;
  readonly onRetry?: () => void;
}

export function ReviewQuestion({
  client,
  examId,
  item,
  cursor,
  total,
  selectedOptions,
  isSubmitting,
  isEnding,
  errorMsg,
  endError,
  onToggleOption,
  onSubmit,
  onPass,
  onEnd,
  onRetry,
}: ReviewQuestionProps) {
  const canSubmit = selectedOptions.length > 0 && !isSubmitting && !isEnding;

  return (
    <section aria-label={`복습 문항 ${cursor + 1}/${total}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <span className="font-semibold text-primary" aria-live="polite">
          문제 {cursor + 1} / {total}
        </span>
        <div className="flex items-center gap-2">
          <BookmarkButton client={client} examId={examId} questionId={item.questionId} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEnd}
            disabled={isSubmitting || Boolean(isEnding)}
            pending={Boolean(isEnding)}
            className="min-h-[44px]"
          >
            {copy.review.endAction}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold leading-relaxed md:text-lg">
            {item.stem}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{copy.review.answerCountHint(item.answerCount)}</p>
        </CardHeader>
        <CardContent>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">보기 선택</legend>
            {item.options.map((opt, idx) => {
              const checked = selectedOptions.includes(opt.optionId);
              return (
                <label
                  key={opt.optionId}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border p-3 text-base transition-colors ${
                    checked
                      ? 'border-primary bg-primary/5 font-medium text-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isSubmitting}
                    onChange={() => onToggleOption(opt.optionId)}
                    className="h-5 w-5 rounded border-border"
                    aria-label={`보기 ${idx + 1} ${opt.text}`}
                  />
                  <span>
                    {idx + 1}. {opt.text}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </CardContent>
      </Card>

      {errorMsg && (
        <Alert variant="error" className="flex flex-col gap-2">
          <p className="text-sm font-medium">{errorMsg}</p>
          {onRetry && (
            <div>
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                {copy.review.retry}
              </Button>
            </div>
          )}
        </Alert>
      )}

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

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onPass}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="min-h-[44px] px-4 text-base"
        >
          {copy.review.pass}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-busy={isSubmitting}
          className="min-h-[44px] px-6 text-base"
        >
          {copy.review.submit}
        </Button>
      </div>
    </section>
  );
}
