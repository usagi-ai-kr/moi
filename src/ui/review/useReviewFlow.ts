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
import { nextSelectedIds } from '../components/option-select';
import {
  reviewKeys,
  useCurrentReviewSession,
  useEndReview,
  useReviewCandidates,
  useStartReview,
  useSubmitReviewAnswer,
} from './queries';
import { useInFlightGuard } from '../study/useInteractionLock';

export function useReviewFlow(client: ApiClient, examId: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const modeParam = searchParams.get('mode');
  const mode: ReviewMode = modeParam === 'bookmark' ? 'bookmark' : 'wrong';
  const [size, setSize] = useState<number>(4);

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
  // #270 복습 시작 동기 가드 — isPending 리렌더 이전 연속 클릭 1회 제한. 서버/D1 계약 변경 없음.
  const startLock = useInFlightGuard();

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
    if (!startLock.tryAcquire(startMutation.isPending)) return;
    startMutation.mutate(
      { examId, mode, size },
      {
        onError: (err) => {
          if (err instanceof HTTPError && err.response.status === 409) {
            void currentQuery.refetch();
          }
        },
        onSettled: () => startLock.release(),
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
    // #308 — 단일 선택(정답 1개)은 radio 계약으로 교체한다. 개수를 모르거나 복수일 때는
    // 기존 누적·해제 토글(checkbox 계약)을 유지한다.
    setSelectedOptions((prev) =>
      currentItem?.answerCount === undefined
        ? prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId]
        : nextSelectedIds(currentItem.answerCount, prev, optId),
    );
  };

  return {
    mode,
    size,
    setSize,
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
