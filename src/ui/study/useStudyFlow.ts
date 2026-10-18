import { useCallback, useEffect, useState } from 'react';
import { HTTPError } from 'ky';
import { copy } from '../copy';
import type { ApiClient, ItemResponse } from '../api/client';
import { isConflict, isUnauthorized, useAbandonStudy, useAnswerStudy, useStartStudy, useStudyHistory, useStudySet, useSubmitStudy } from './queries';
import { useStudyUiStore } from './store';
import { STUDY_EXAM_ID } from './types';
import { clearSetDrafts, completeDraftSend, dropTabState, listDraftsForSet, openDraftStorage, recordDraft } from './draft-sync';
import { useDraftSync } from './useDraftSync';
import { useTabState } from './useTabState';

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
// 계정(userId)별 초안·탭 상태를 연결하고 오프라인 재전송·충돌 선택을 처리한다 (이슈 #52, ADR-0021).
export function useStudyFlow(client: ApiClient, userId: string) {
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
  const sync = useDraftSync(client, userId, setId, setQuery, s.setSave);
  useTabState(userId, setId, setQuery.data ?? null, s);

  useEffect(() => {
    if (setId && s.view === 'start') s.setView('active');
  }, [setId]);

  // 충돌·미전송 초안이 남거나 재전송 중이면 제출을 막는다 — 재전송 결과 확인 전 채점되는 것을 방지한다 (이슈 #52).
  const blocked = sync.conflicts.length > 0 || sync.unsynced.size > 0 || sync.busy;
  useEffect(() => {
    if (!blocked) setSubmitError((prev) => (prev === copy.study.syncBlocked ? null : prev));
  }, [blocked]);

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
      const current = setQuery.data?.items.find((i) => i.questionId === questionId)?.response;
      const base = previous ?? current ?? { kind: 'unanswered' as const };
      // 서버 확인 답안을 base로 초안에 기록 — localStorage 예외는 저장 실패로 처리하고 앱은 계속한다 (이슈 #52).
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
              // 네트워크 실패 — optimistic 답안을 유지하고 '오프라인 임시 저장'으로 표시한다(재전송 대기).
              s.setSave(draft === 'failed' ? 'error' : 'offline');
              return;
            }
            setFailed({ questionId, response });
            s.setSave('error');
          },
        },
      );
    },
    [answerMut, s, setId, setQuery.data, sync, userId],
  );

  // 저장 실패·오프라인 재시도 — 초안을 서버와 대조해 재전송한다 (이슈 #52).
  // 초안 sync 우선, 저장소 없음·초안 없음 + failed 있음이면 마지막 실패 응답 1회 재전송(충돌 자동 덮어쓰기 금지).
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
    // 서버가 이미 제3의 값(로컬 실패 응답도 base도 아님)이면 자동 덮어쓰지 않는다.
    if (
      cur &&
      cur.kind !== 'unanswered' &&
      JSON.stringify(cur) !== JSON.stringify(last.response)
    ) {
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

  const set = setQuery.data ?? null;
  const unanswered = set ? set.items.filter((i) => i.response.kind === 'unanswered').length : 0;

  const handleSubmitRequest = useCallback(() => {
    // 재전송 중(sync.busy)에도 같은 안내로 제출을 막는다 — 사용자 선택·재시도를 기다린 뒤 제출한다 (이슈 #52).
    if (sync.conflicts.length > 0 || sync.unsynced.size > 0 || sync.busy) {
      setSubmitError(copy.study.syncBlocked);
      return;
    }
    if (unanswered > 0) s.setConfirmSubmit(true);
    else doSubmit();
  }, [doSubmit, s, sync.busy, sync.conflicts, sync.unsynced, unanswered]);

  const doAbandon = useCallback(() => {
    if (!setId) return;
    abandonMut.mutate(setId, {
      onSuccess: () => {
        s.setConfirmAbandon(false);
        clearSetDrafts(openDraftStorage(), userId, setId);
        dropTabState(userId, setId);
        s.resetFlow();
        setSetId(null);
        writeStudyParam(null);
        s.setView('start');
      },
    });
  }, [abandonMut, s, setId, userId]);

  const restart = useCallback(() => {
    if (setId) {
      clearSetDrafts(openDraftStorage(), userId, setId);
      dropTabState(userId, setId);
    }
    setSetId(null);
    writeStudyParam(null);
    s.resetFlow();
    s.setView('start');
  }, [s, setId, userId]);

  return {
    s, set, setId, unanswered, setQuery, historyQuery,
    startMut, answerMut, submitMut, abandonMut,
    startError, conflict, unauth, submitError, blocked,
    conflicts: sync.conflicts, syncBusy: sync.busy,
    handleStart, handleAnswer, doSubmit, doAbandon, restart, handleRetry, handleSubmitRequest,
    resolveServer: sync.resolveServer, resolveMine: sync.resolveMine,
  };
}
