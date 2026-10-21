import { useCallback, useEffect, useState } from 'react';
import { HTTPError } from 'ky';
import { copy } from '../copy';
import type { ApiClient, ItemResponse } from '../api/client';
import { useExamScope } from '../exam/ExamScopeProvider';
import { isConflict, isUnauthorized, useAbandonStudy, useAnswerStudy, useStartStudy, useStudyHistory, useStudySet, useSubmitStudy } from './queries';
import { useAbandonFlow } from './useAbandonFlow';
import { useInFlightGuard } from './useInteractionLock';
import { useStudyUiStore } from './store';
import { clearSetDrafts, completeDraftSend, dropTabState, listDraftsForSet, openDraftStorage, recordDraft } from './draft-sync';
import { useDraftSync } from './useDraftSync';
import { useTabState } from './useTabState';
import { readStudyParam, writeStudyParam } from './study-url';
import type { StudyFlowOptions } from './types';

// URL 동기화 헬퍼와 옵션 타입은 새 모듈로 추출했다(#268 Slice 2C — 250줄 상한 해소, ADR-0061 과 같은 목적).
// 기존 import 경로를 유지하려고 여기서 다시 내보낸다.
export { readStudyParam, writeStudyParam } from './study-url';
export type { StudyFlowOptions } from './types';

// 시작·답안·제출·포기 흐름 (#52, ADR-0021). 라우트 분리(#148): param 우선, 콜백 없으면 legacy fallback.
export function useStudyFlow(client: ApiClient, userId: string, opts?: StudyFlowOptions) {
  const s = useStudyUiStore();
  const { examId } = useExamScope();
  const initialOpt = opts?.initialSetId;
  const [setId, setSetId] = useState<string | null>(() => (initialOpt !== undefined ? initialOpt : readStudyParam()));
  const [size, setSize] = useState<number>(4);
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
  const startLock = useInFlightGuard(), submitLock = useInFlightGuard();
  const sync = useDraftSync(client, userId, setId, setQuery, s.setSave);
  useTabState(userId, setId, setQuery.data ?? null, s);

  useEffect(() => {
    if (initialOpt !== undefined) setSetId(initialOpt);
  }, [initialOpt]);
  useEffect(() => {
    if (setId && s.view === 'start') s.setView('active');
  }, [setId]);
  const blocked = sync.conflicts.length > 0 || sync.unsynced.size > 0 || sync.busy;
  useEffect(() => {
    if (!blocked) setSubmitError((prev) => (prev === copy.study.syncBlocked ? null : prev));
  }, [blocked]);
  const handleStart = useCallback(() => {
    if (!startLock.tryAcquire(startMut.isPending)) return;
    setStartError(null);
    setConflict(false);
    setUnauth(false);
    startMut.mutate(
      s.scope === 'domain'
        ? { examId, mode: s.scope, domainId: s.domainId, size }
        : { examId, mode: s.scope, size },
      {
        onSuccess: (set) => {
          setSetId(set.id);
          s.resetFlow();
          s.setView('active');
          if (opts?.onSetStarted) opts.onSetStarted(set.id);
          else writeStudyParam(set.id);
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
        onSettled: () => startLock.release(),
      },
    );
  }, [s, setId, startMut, opts, examId, startLock]);

  const handleAnswer = useCallback(
    (questionId: string, response: ItemResponse, previous?: ItemResponse) => {
      if (!setId || submitMut.isPending) return;
      s.setSave('saving');
      const current = setQuery.data?.items.find((i) => i.questionId === questionId)?.response;
      const base = previous ?? current ?? { kind: 'unanswered' as const };
      const draft = recordDraft(openDraftStorage(), userId, setId, questionId, response, base);
      if (draft === 'saved') sync.markUnsynced(questionId);
      else sync.clearUnsynced(questionId);
      answerMut.mutate(
        { setId, questionId, response, previous: base },
        {
          onSuccess: () => {
            setFailed(null);
            completeDraftSend(openDraftStorage(), userId, setId, questionId, response);
            sync.clearUnsynced(questionId);
            sync.clearConflict(questionId);
            s.setSave(draft === 'failed' ? 'error' : 'saved');
          },
          onError: (e) => {
            if (isUnauthorized(e)) return setUnauth(true);
            if (!(e instanceof HTTPError)) {
              if (draft === 'failed') setFailed({ questionId, response }); // 초안 저장 실패 — 메모리 답안으로 재시도 (#52 AC7)
              s.setSave(draft === 'failed' ? 'error' : 'offline');
              return;
            }
            setFailed({ questionId, response });
            s.setSave('error');
          },
        },
      );
    },
    [answerMut, s, setId, setQuery.data, submitMut.isPending, sync, userId],
  );

  const handleRetry = useCallback(() => {
    if (!setId) return;
    let hasDrafts = false;
    try {
      const st = openDraftStorage();
      if (st) hasDrafts = listDraftsForSet(st, userId, setId).length > 0;
    } catch {
      hasDrafts = false;
    }
    if (hasDrafts) {
      sync.retrySync();
      return;
    }
    const last = failed;
    if (!last) {
      sync.retrySync();
      return;
    }
    const cur = setQuery.data?.items.find((i) => i.questionId === last.questionId)?.response;
    if (cur && cur.kind !== 'unanswered' && JSON.stringify(cur) !== JSON.stringify(last.response)) {
      sync.retrySync();
      return;
    }
    const prev = cur ?? ({ kind: 'unanswered' } as const);
    s.setSave('saving');
    answerMut.mutate(
      { setId, questionId: last.questionId, response: last.response, previous: prev },
      {
        onSuccess: () => {
          setFailed(null);
          completeDraftSend(openDraftStorage(), userId, setId, last.questionId, last.response);
          sync.clearUnsynced(last.questionId);
          sync.clearConflict(last.questionId);
          s.setSave('saved');
        },
        onError: (e) => {
          if (isUnauthorized(e)) return setUnauth(true);
          if (!(e instanceof HTTPError)) {
            s.setSave('offline');
            return;
          }
          s.setSave('error');
        },
      },
    );
  }, [answerMut, failed, s, setId, setQuery.data, sync, userId]);

  const doSubmit = useCallback(() => {
    if (!setId || !submitLock.tryAcquire(submitMut.isPending)) return;
    setSubmitError(null);
    submitMut.mutate(
      { setId, confirmUnanswered: true },
      {
        onSuccess: (submitted) => {
          s.setConfirmSubmit(false);
          s.setView('result');
          if (opts?.onSubmitted) opts.onSubmitted(submitted.id);
        },
        onError: (e) => setSubmitError(isUnauthorized(e) ? copy.study.needLogin : '제출하지 못했습니다.'),
        onSettled: () => submitLock.release(),
      },
    );
  }, [setId, submitMut, s, opts, submitLock]);

  const set = setQuery.data ?? null;
  const unanswered = set ? set.items.filter((i) => i.response.kind === 'unanswered').length : 0;

  const handleSubmitRequest = useCallback(() => {
    if (submitMut.isPending) return;
    if (sync.conflicts.length > 0 || sync.unsynced.size > 0 || sync.busy) {
      setSubmitError(copy.study.syncBlocked);
      return;
    }
    if (unanswered > 0) s.setConfirmSubmit(true);
    else doSubmit();
  }, [doSubmit, s, submitMut.isPending, sync.busy, sync.conflicts, sync.unsynced, unanswered]);

  const abandon = useAbandonFlow({
    setId, userId, store: s, abandonMut,
    onAbandoned: opts?.onAbandoned,
    writeStudyParam,
    clearSetId: () => setSetId(null),
  });
  const doAbandon = abandon.doAbandon;
  const abandonError = abandon.abandonError;
  const clearAbandonError = abandon.clearAbandonError;

  const restart = useCallback(() => {
    if (setId) {
      clearSetDrafts(openDraftStorage(), userId, setId);
      dropTabState(userId, setId);
    }
    setSetId(null);
    s.resetFlow();
    s.setView('start');
    if (opts?.onAbandoned) opts.onAbandoned();
    else writeStudyParam(null);
  }, [s, setId, userId, opts]);

  return {
    s, set, setId, unanswered, setQuery, historyQuery,
    size, setSize,
    startMut, answerMut, submitMut, abandonMut,
    startError, conflict, unauth, submitError, blocked,
    conflicts: sync.conflicts, syncBusy: sync.busy,
    handleStart, handleAnswer, doSubmit, doAbandon, abandonError, clearAbandonError,
    restart, handleRetry, handleSubmitRequest,
    resolveServer: sync.resolveServer, resolveMine: sync.resolveMine,
  };
}
