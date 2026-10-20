import { useCallback, useRef, useState } from 'react';
import { copy } from '../copy';
import { isUnauthorized, type useAbandonStudy } from './queries';
import { clearSetDrafts, dropTabState, openDraftStorage } from './draft-sync';
import type { StudyUiState } from './store';

// 포기 흐름만 분리 — useStudyFlow 상한(250줄) 초과 방지, #223.
// 즉시 ref 가드로 리렌더 이전 연속 호출을 차단하고(isPending만으로 부족),
// 실패 시 해제해 재시도한다. 성공 전에는 draft/답안/세트를 건드리지 않는다.
interface Deps {
  setId: string | null;
  userId: string;
  store: Pick<StudyUiState, 'setConfirmAbandon' | 'resetFlow' | 'setView'>;
  abandonMut: ReturnType<typeof useAbandonStudy>;
  onAbandoned?: () => void;
  writeStudyParam: (id: string | null) => void;
  clearSetId: () => void;
}

export function useAbandonFlow({ setId, userId, store, abandonMut, onAbandoned, writeStudyParam, clearSetId }: Deps) {
  const [abandonError, setAbandonError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const clearAbandonError = useCallback(() => setAbandonError(null), []);

  const doAbandon = useCallback(() => {
    if (!setId) return;
    if (inFlightRef.current || abandonMut.isPending) return;
    inFlightRef.current = true;
    setAbandonError(null);
    abandonMut.mutate(setId, {
      onSuccess: () => {
        inFlightRef.current = false;
        store.setConfirmAbandon(false);
        clearSetDrafts(openDraftStorage(), userId, setId);
        dropTabState(userId, setId);
        store.resetFlow();
        clearSetId();
        store.setView('start');
        if (onAbandoned) onAbandoned();
        else writeStudyParam(null);
      },
      onError: (e) => {
        inFlightRef.current = false;
        setAbandonError(isUnauthorized(e) ? copy.study.needLogin : copy.study.abandonError);
      },
    });
  }, [abandonMut, clearSetId, onAbandoned, setId, store, userId, writeStudyParam]);

  return { abandonError, clearAbandonError, doAbandon };
}
