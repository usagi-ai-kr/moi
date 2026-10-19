import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { HTTPError } from 'ky';
import type { ApiClient } from '../api/client';
import type {
  ReviewAnswerResponse,
  ReviewEndResponse,
  ReviewMode,
  ReviewPendingItem,
} from '../api/review-client';
import { copy } from '../copy';
import {
  reviewKeys,
  useCurrentReviewSession,
  useEndReview,
  useReviewCandidates,
  useStartReview,
  useSubmitReviewAnswer,
} from './queries';

export function useReviewFlow(client: ApiClient, examId: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const modeParam = searchParams.get('mode');
  const mode: ReviewMode = modeParam === 'bookmark' ? 'bookmark' : 'wrong';

  useEffect(() => {
    if (modeParam !== 'wrong' && modeParam !== 'bookmark') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('mode', 'wrong');
          return next;
        },
        { replace: true },
      );
    }
  }, [modeParam, setSearchParams]);

  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<ReviewAnswerResponse | null>(null);
  const [answeredItem, setAnsweredItem] = useState<ReviewPendingItem | null>(null);
  const [endSummary, setEndSummary] = useState<ReviewEndResponse['summary'] | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  const currentQuery = useCurrentReviewSession(client, examId, mode);
  const candidatesQuery = useReviewCandidates(client, examId, mode);
  const startMutation = useStartReview(client);
  const submitMutation = useSubmitReviewAnswer(client);
  const endMutation = useEndReview(client);

  const isBusy =
    startMutation.isPending ||
    submitMutation.isPending ||
    endMutation.isPending;

  const activeSession = currentQuery.data;
  const currentItem = activeSession?.current;

  useEffect(() => {
    setSelectedOptions([]);
    setAnswerError(null);
  }, [currentItem?.questionId]);

  const setTab = (newMode: ReviewMode) => {
    if (newMode === mode || isBusy) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('mode', newMode);
      return next;
    });
    setFeedback(null);
    setAnsweredItem(null);
    setEndSummary(null);
    setAnswerError(null);
    setEndError(null);
    setSelectedOptions([]);
  };

  const handleStart = () => {
    startMutation.mutate(
      { examId, mode },
      {
        onError: (err) => {
          if (err instanceof HTTPError && err.response.status === 409) {
            void currentQuery.refetch();
          }
        },
      },
    );
  };

  const handleSubmit = (pass = false) => {
    if (!currentItem) return;
    setAnswerError(null);
    const itemToSubmit = currentItem;
    const reqMode = mode;
    submitMutation.mutate(
      {
        examId,
        mode: reqMode,
        questionId: itemToSubmit.questionId,
        response: pass ? { kind: 'pass' } : { kind: 'answered', optionIds: selectedOptions },
      },
      {
        onSuccess: (data) => {
          if (mode !== reqMode) return;
          setAnsweredItem(itemToSubmit);
          setFeedback(data);
          setSelectedOptions([]);
        },
        onError: (err) => {
          if (mode !== reqMode) return;
          if (err instanceof HTTPError && err.response.status === 401) {
            setAnswerError(copy.review.needLogin);
          } else {
            setAnswerError(copy.review.answerError);
          }
        },
      },
    );
  };

  const handleNext = () => {
    if (!feedback) return;
    const nextItem = feedback.next;
    queryClient.setQueryData(reviewKeys.current(examId, mode), {
      examId,
      mode,
      status: feedback.session.status,
      cursor: feedback.session.cursor,
      total: feedback.session.total,
      current: nextItem ? { ...nextItem, response: null } : null,
      exhausted: nextItem === null,
      items: [],
    });
    setFeedback(null);
    setAnsweredItem(null);
  };

  const handleEnd = () => {
    setEndError(null);
    endMutation.mutate(
      { examId, mode },
      {
        onSuccess: (data) => {
          setEndSummary(data.summary);
          setFeedback(null);
          setAnsweredItem(null);
        },
        onError: () => {
          setEndError(copy.review.endError);
        },
      },
    );
  };

  const handleToggleOption = (optId: string) => {
    setSelectedOptions((prev) =>
      prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId],
    );
  };

  return {
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
    clearEndSummary: () => setEndSummary(null),
  };
}
