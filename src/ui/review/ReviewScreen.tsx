import type { ApiClient } from '../api/client';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { copy } from '../copy';
import { STUDY_EXAM_ID } from '../study/types';
import { ReviewCandidates } from './ReviewCandidates';
import { ReviewExhausted } from './ReviewExhausted';
import { ReviewFeedback } from './ReviewFeedback';
import { ReviewQuestion } from './ReviewQuestion';
import { ReviewSummary } from './ReviewSummary';
import { useReviewFlow } from './useReviewFlow';

interface Props {
  readonly client: ApiClient;
  readonly examId?: string;
}

export function ReviewScreen({ client, examId = STUDY_EXAM_ID }: Props) {
  const {
    mode,
    isBusy,
    currentQuery,
    candidatesQuery,
    startMutation,
    submitMutation,
    endMutation,
    activeSession,
    currentItem,
    selectedOptions,
    feedback,
    answeredItem,
    endSummary,
    answerError,
    endError,
    setTab,
    handleStart,
    handleSubmit,
    handleNext,
    handleEnd,
    handleToggleOption,
    clearEndSummary,
  } = useReviewFlow(client, examId);

  return (
    <div className="moi-page flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="moi-title">{copy.review.title}</h1>
        <div role="tablist" aria-label={copy.review.title} className="flex flex-wrap gap-2 border-b border-border pb-3">
          <Button
            role="tab"
            variant={mode === 'wrong' ? 'primary' : 'outline'}
            aria-selected={mode === 'wrong'}
            disabled={isBusy}
            onClick={() => setTab('wrong')}
          >
            {copy.review.tabWrong}
          </Button>
          <Button
            role="tab"
            variant={mode === 'bookmark' ? 'primary' : 'outline'}
            aria-selected={mode === 'bookmark'}
            disabled={isBusy}
            onClick={() => setTab('bookmark')}
          >
            {copy.review.tabBookmark}
          </Button>
        </div>
      </header>

      {currentQuery.isLoading && (
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {currentQuery.isError && (
        <Alert variant="error" className="flex flex-col gap-2">
          <p>{copy.review.sessionLoadError}</p>
          <div>
            <Button size="sm" variant="outline" onClick={() => void currentQuery.refetch()}>
              {copy.review.retry}
            </Button>
          </div>
        </Alert>
      )}

      {!currentQuery.isLoading && !currentQuery.isError && endSummary && (
        <ReviewSummary summary={endSummary} onBackToCandidates={clearEndSummary} />
      )}

      {!currentQuery.isLoading && !currentQuery.isError && !endSummary && feedback && answeredItem && (
        <ReviewFeedback
          client={client}
          examId={examId}
          questionId={answeredItem.questionId}
          stem={answeredItem.stem}
          options={answeredItem.options}
          graded={feedback.graded}
          hasNext={feedback.next !== null}
          isEnding={endMutation.isPending}
          endError={endError}
          onNext={handleNext}
          onEnd={handleEnd}
        />
      )}

      {!currentQuery.isLoading && !currentQuery.isError && !endSummary && !feedback && activeSession && currentItem && !activeSession.exhausted && (
        <ReviewQuestion
          client={client}
          examId={examId}
          item={currentItem}
          cursor={activeSession.cursor}
          total={activeSession.total}
          selectedOptions={selectedOptions}
          isSubmitting={submitMutation.isPending}
          isEnding={endMutation.isPending}
          errorMsg={answerError}
          endError={endError}
          onToggleOption={handleToggleOption}
          onSubmit={() => handleSubmit(false)}
          onPass={() => handleSubmit(true)}
          onEnd={handleEnd}
          onRetry={() => handleSubmit(false)}
        />
      )}

      {!currentQuery.isLoading && !currentQuery.isError && !endSummary && !feedback && activeSession && (!currentItem || activeSession.exhausted) && (
        <ReviewExhausted
          isEnding={endMutation.isPending}
          endError={endError}
          onEnd={handleEnd}
        />
      )}

      {!currentQuery.isLoading && !currentQuery.isError && !endSummary && !feedback && !activeSession && (
        <ReviewCandidates
          data={candidatesQuery.data}
          isLoading={candidatesQuery.isLoading}
          isError={candidatesQuery.isError}
          mode={mode}
          isStarting={startMutation.isPending}
          onStart={handleStart}
          onRetry={() => void candidatesQuery.refetch()}
          onSelectMode={setTab}
        />
      )}
    </div>
  );
}
