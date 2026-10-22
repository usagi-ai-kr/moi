import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { HTTPError } from 'ky';
import { answerStudyItem, type ApiClient, type StudyActiveSet } from '../api/client';
import type { SaveState } from './types';
import { removeDraft } from './drafts';
import { completeDraftSend, listDraftsForSet, openDraftStorage, planDrafts, type ConflictItem } from './draft-sync';

/**
 * 학습 초안 reconcile·재전송·충돌 처리 훅 (이슈 #52, ADR-0021).
 * - 마운트·세트 로드·`online` 이벤트·수동 재시도에서 초안을 서버와 대조한다.
 * - 서버 확인 전 '저장됨'을 만들지 않고, 충돌은 자동으로 고르지 않는다(사용자 선택 필요).
 * - lock으로 동시 sync를 1회로 제한한다.
 */
export function useDraftSync(
  client: ApiClient,
  userId: string,
  setId: string | null,
  setQuery: UseQueryResult<StudyActiveSet, Error>,
  setSave: (s: SaveState) => void,
) {
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [unsynced, setUnsynced] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const lockRef = useRef(false);

  const markUnsynced = useCallback((questionId: string) => {
    setUnsynced((prev) => new Set(prev).add(questionId));
  }, []);

  const clearUnsynced = useCallback((questionId: string) => {
    setUnsynced((prev) => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  }, []);

  const clearConflict = useCallback((questionId: string) => {
    setConflicts((prev) => (prev.some((c) => c.questionId === questionId) ? prev.filter((c) => c.questionId !== questionId) : prev));
  }, []);

  /** 초안 reconcile + 재전송 — `fetchFirst`면 서버 최신본을 먼저 받아 충돌을 판정한다(online·재시도). */
  const syncNow = useCallback(
    async (fetchFirst: boolean) => {
      if (lockRef.current || !setId) return;
      const storage = openDraftStorage();
      if (!storage) return;
      lockRef.current = true;
      setBusy(true);
      try {
        const drafts = listDraftsForSet(storage, userId, setId);
        if (drafts.length === 0) {
          setUnsynced(new Set());
          return;
        }
        const serverSet = fetchFirst ? ((await setQuery.refetch()).data ?? null) : (setQuery.data ?? null);
        if (!serverSet) {
          setSave('offline'); // 서버 확인 불가 — 초안을 유지하고 재시도를 안내한다
          return;
        }
        if (serverSet.status === 'submitted') {
          // 제출 완료 — 결과를 덮어쓰지 않고 초안만 제거한다
          for (const d of drafts) removeDraft(storage, userId, setId, d.questionId);
          setConflicts([]);
          setUnsynced(new Set());
          return;
        }
        const plan = planDrafts(drafts, serverSet);
        for (const questionId of plan.applied) removeDraft(storage, userId, setId, questionId);
        setConflicts(plan.conflict);
        const failed: string[] = [];
        let offline = false;
        for (const c of plan.send) {
          try {
            await answerStudyItem(client, setId, { questionId: c.questionId, response: c.response });
            completeDraftSend(storage, userId, setId, c.questionId, c.response);
          } catch (err) {
            if (!(err instanceof HTTPError)) offline = true;
            failed.push(c.questionId);
          }
        }
        setUnsynced(new Set([...failed, ...plan.conflict.map((c) => c.questionId)]));
        if (plan.send.length > 0) await setQuery.refetch(); // 서버 최신본으로 화면 갱신
        if (plan.conflict.length > 0) setSave('conflict');
        else if (failed.length > 0) setSave(offline ? 'offline' : 'error');
        else if (plan.send.length > 0) setSave('saved');
      } catch {
        setSave('error'); // 예상 밖 저장소 오류 — 앱은 계속하고 재시도를 안내한다
      } finally {
        lockRef.current = false;
        setBusy(false);
      }
    },
    [client, setId, setQuery, setSave, userId],
  );

  // syncNow 최신 참조 — 이벤트·효과에서 오래된 클로저를 부르지 않는다
  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;

  const retrySync = useCallback(() => {
    void syncRef.current(true);
  }, []);

  // 충돌 해소 — 서버 답안 사용: 초안 제거 + 서버 값 반영 / 내 답안 사용: PATCH 후 성공 시 제거
  const resolveServer = useCallback(
    async (questionId: string) => {
      if (!setId) return;
      const storage = openDraftStorage();
      if (storage) removeDraft(storage, userId, setId, questionId);
      clearConflict(questionId);
      clearUnsynced(questionId);
      setSave('idle');
      await setQuery.refetch();
    },
    [clearConflict, clearUnsynced, setId, setQuery, setSave, userId],
  );

  const resolveMine = useCallback(
    async (questionId: string) => {
      if (!setId) return;
      const storage = openDraftStorage();
      const draft = storage ? listDraftsForSet(storage, userId, setId).find((d) => d.questionId === questionId) : undefined;
      if (!draft) {
        clearConflict(questionId);
        clearUnsynced(questionId);
        return;
      }
      setBusy(true);
      try {
        await answerStudyItem(client, setId, { questionId, response: draft.entry.response });
        completeDraftSend(storage, userId, setId, questionId, draft.entry.response);
        clearConflict(questionId);
        clearUnsynced(questionId);
        setSave('saved');
        await setQuery.refetch();
      } catch (err) {
        setSave(err instanceof HTTPError ? 'error' : 'offline');
      } finally {
        setBusy(false);
      }
    },
    [clearConflict, clearUnsynced, client, setId, setQuery, setSave, userId],
  );

  // 마운트·세트 로드 — 세트당 1회, 저장된 초안을 서버와 대조한다
  const reconciledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!setId || !setQuery.data || reconciledRef.current === setId) return;
    reconciledRef.current = setId;
    void syncRef.current(false);
  }, [setId, setQuery.data]);

  // 재연결 — 네트워크 복구 시 서버 최신본과 대조해 재전송한다
  useEffect(() => {
    const onOnline = () => {
      void syncRef.current(true);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return { conflicts, unsynced, busy, markUnsynced, clearUnsynced, clearConflict, retrySync, resolveServer, resolveMine };
}
