import { useCallback, useState } from 'react';
import { HTTPError } from 'ky';
import { copy } from '../copy';
import type { ApiClient, StudyActiveSet, StudyMode } from '../api/client';
import { isConflict, isUnauthorized, readRequestedSize, useStartStudy } from './queries';
import { useInFlightGuard } from './useInteractionLock';
import type { StudyUiState } from './store';
import { clearSetDrafts, dropTabState, openDraftStorage } from './draft-sync';
import type { StudyFlowOptions } from './types';
import { writeStudyParam } from './study-url';

type StartInput = { examId: string; mode: StudyMode; domainId?: string; size: number };

async function startFailureMessage(error: unknown): Promise<string> {
  if (error instanceof HTTPError && error.response.status === 422) {
    try {
      const body = (await error.response.clone().json()) as { error?: unknown };
      if (body.error === 'pool_insufficient') return copy.study.poolInsufficient;
    } catch {
      // 응답 본문이 없거나 JSON이 아니면 일반 재시도 안내를 표시한다.
    }
  }
  return copy.study.startFailed;
}

export function useStudyStartActions({
  client,
  examId,
  userId,
  store,
  setSetId,
  opts,
}: {
  client: ApiClient;
  examId: string;
  userId: string;
  store: StudyUiState;
  setSetId: (id: string | null) => void;
  opts?: StudyFlowOptions;
}) {
  const startMut = useStartStudy(client);
  const startLock = useInFlightGuard();
  const [startError, setStartError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [unauth, setUnauth] = useState(false);

  const start = useCallback((input: StartInput, previousSetId?: string) => {
    if (!startLock.tryAcquire(startMut.isPending)) return;
    setStartError(null);
    setConflict(false);
    setUnauth(false);
    startMut.mutate(input, {
      onSuccess: (nextSet) => {
        if (previousSetId) {
          clearSetDrafts(openDraftStorage(), userId, previousSetId);
          dropTabState(userId, previousSetId);
        }
        setSetId(nextSet.id);
        store.resetFlow();
        store.setView('active');
        if (opts?.onSetStarted) opts.onSetStarted(nextSet.id);
        else writeStudyParam(nextSet.id);
      },
      onError: async (error) => {
        if (isConflict(error)) {
          setConflict(true);
          return;
        }
        if (isUnauthorized(error)) {
          setUnauth(true);
          return;
        }
        setStartError(await startFailureMessage(error));
      },
      onSettled: () => startLock.release(),
    });
  }, [opts, setSetId, startLock, startMut, store, userId]);

  const handleStart = useCallback(() => {
    start(
      store.scope === 'domain'
        ? { examId, mode: store.scope, domainId: store.domainId, size: store.size }
        : { examId, mode: store.scope, size: store.size },
    );
  }, [examId, start, store]);

  const restart = useCallback((set: StudyActiveSet) => {
    const requested = readRequestedSize(set.examId);
    const size = requested?.setId === set.id ? requested.size : store.size;
    store.setScope(set.mode);
    if (set.domainId) store.setDomainId(set.domainId);
    store.setSize(size);
    start(
      set.mode === 'domain'
        ? { examId: set.examId, mode: set.mode, domainId: set.domainId, size }
        : { examId: set.examId, mode: set.mode, size },
      set.id,
    );
  }, [start, store]);

  return { startMut, startError, conflict, unauth, handleStart, restart };
}
