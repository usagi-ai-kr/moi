import type { ApiClient } from '../api/client';
import type { ReviewPendingItem } from '../api/review-client';
import { OptionFieldset } from '../components/option-fieldset';
import { OptionRow } from '../components/option-row';
import { QuestionCard } from '../components/question-card';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { copy } from '../copy';
import { BookmarkButton } from './BookmarkButton';
import { iconPass, iconRefresh, iconSubmit } from '../icons';

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
          문제 {cursor + 1}/{total}
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

      {/* 진행 바(4px) — 학습과 같은 바로 통일(#274 fix r2). 장식용이므로 스크린리더에서 숨긴다. */}
      <div className="moi-study-progressbar" aria-hidden="true">
        <span style={{ width: `${Math.round(((cursor + 1) / total) * 100)}%` }} />
      </div>

      <QuestionCard stem={item.stem} hint={copy.review.answerCountHint(item.answerCount)}>
        <OptionFieldset>
          {item.options.map((opt, idx) => (
            <OptionRow
              key={opt.optionId}
              checked={selectedOptions.includes(opt.optionId)}
              disabled={isSubmitting}
              onChange={() => onToggleOption(opt.optionId)}
              ariaLabel={`보기 ${idx + 1} ${opt.text}`}
              index={idx}
              text={opt.text}
            />
          ))}
        </OptionFieldset>
      </QuestionCard>

      {errorMsg && (
        <Alert variant="error" className="flex flex-col gap-2">
          <p className="text-sm font-medium">{errorMsg}</p>
          {onRetry && (
            <div>
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                <iconRefresh.icon aria-hidden="true" size={iconRefresh.size} className="mr-1" />
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
              <iconRefresh.icon aria-hidden="true" size={iconRefresh.size} className="mr-1" />
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
          <iconPass.icon aria-hidden="true" size={iconPass.size} className="mr-1" />
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
          <iconSubmit.icon aria-hidden="true" size={iconSubmit.size} className="mr-1" />
          {copy.review.submit}
        </Button>
      </div>
    </section>
  );
}
