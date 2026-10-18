import { useCallback, useEffect, useState } from 'react';
import { copy } from '../copy';
import type { ApiClient, ItemResponse } from '../api/client';
import { isConflict, isUnauthorized, useAbandonStudy, useAnswerStudy, useStartStudy, useStudyHistory, useStudySet, useSubmitStudy } from './queries';
import { useStudyUiStore } from './store';
import { STUDY_EXAM_ID } from './types';

export function readStudyParam(): string | null {
  try {
    return new URL(window.location.href).searchParams.get('study');
  } catch {
    return null;
  }
}

export function writeStudyParam(id: string | null): void {
  try {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('study', id);
    else u.searchParams.delete('study');
    window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
  } catch {
    // URL 동기화 실패는 무시 — 메모리 상태로 계속한다.
  }
}

// 시작·답안·제출·포기 흐름 — 화면(StudyScreen)은 렌더만 담당한다.
export function useStudyFlow(client: ApiClient) {
  const s = useStudyUiStore();
  const [setId, setSetId] = useState<string | null>(() => readStudyParam());
  const [startError, setStartError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [unauth, setUnauth] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ questionId: string; response: ItemResponse } | null>(null);
  const setQuery = useStudySet(client, setId);
  const historyQuery = useStudyHistory(client, s.historyPage, 20, s.view === 'history');
  const startMut = useStartStudy(client);
  const answerMut = useAnswerStudy(client);
  const submitMut = useSubmitStudy(client);
  const abandonMut = useAbandonStudy(client);

  useEffect(() => {
    if (setId && s.view === 'start') s.setView('active');
  }, [setId]);

  const handleStart = useCallback(() => {
    setStartError(null);
    setConflict(false);
    setUnauth(false);
    startMut.mutate(
      s.scope === 'domain'
        ? { examId: STUDY_EXAM_ID, mode: s.scope, domainId: s.domainId }
        : { examId: STUDY_EXAM_ID, mode: s.scope },
      {
        onSuccess: (set) => {
          setSetId(set.id);
          writeStudyParam(set.id);
          s.resetFlow();
          s.setView('active');
        },
        onError: (err) => {
          if (isConflict(err)) {
            setConflict(true);
            if (setId) s.setView('active');
            return;
          }
          if (isUnauthorized(err)) {
            setUnauth(true);
            return;
          }
          setStartError('시작하지 못했습니다. 다시 시도해 주세요.');
        },
      },
    );
  }, [s, setId, startMut]);

  const handleAnswer = useCallback(
    (questionId: string, response: ItemResponse, previous?: ItemResponse) => {
      if (!setId) return;
      s.setSave('saving');
      answerMut.mutate(
        { setId, questionId, response, previous: previous ?? response },
        {
          onSuccess: () => { setFailed(null); s.setSave('saved'); },
          onError: (e) => {
            if (isUnauthorized(e)) return setUnauth(true);
            setFailed({ questionId, response });
            s.setSave('error');
          },
        },
      );
    },
    [answerMut, s, setId],
  );

  // 저장 실패 재시도 — 마지막 실패 응답을 다시 PATCH한다.
  const handleRetry = useCallback(() => {
    if (failed) handleAnswer(failed.questionId, failed.response);
    else s.setSave('idle');
  }, [failed, handleAnswer, s]);

  const doSubmit = useCallback(() => {
    if (!setId) return;
    setSubmitError(null);
    submitMut.mutate(
      { setId, confirmUnanswered: true },
      {
        onSuccess: () => {
          s.setConfirmSubmit(false);
          s.setView('result');
        },
        onError: (e) => setSubmitError(isUnauthorized(e) ? copy.study.needLogin : '제출하지 못했습니다.'),
      },
    );
  }, [setId, submitMut, s]);

  const doAbandon = useCallback(() => {
    if (!setId) return;
    abandonMut.mutate(setId, {
      onSuccess: () => {
        s.setConfirmAbandon(false);
        s.resetFlow();
        setSetId(null);
        writeStudyParam(null);
        s.setView('start');
      },
    });
  }, [abandonMut, s, setId]);

  const restart = useCallback(() => {
    setSetId(null);
    writeStudyParam(null);
    s.resetFlow();
    s.setView('start');
  }, [s]);

  const set = setQuery.data ?? null;
  const unanswered = set ? set.items.filter((i) => i.response.kind === 'unanswered').length : 0;

  return {
    s, set, setId, unanswered, setQuery, historyQuery,
    startMut, answerMut, submitMut, abandonMut,
    startError, conflict, unauth, submitError,
    handleStart, handleAnswer, doSubmit, doAbandon, restart, handleRetry,
  };
}
