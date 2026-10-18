import { useEffect, useRef } from 'react';
import type { StudyActiveSet } from '../api/client';
import { loadTabState, persistTabState } from './draft-sync';
import type { StudyUiState } from './store';

/**
 * 학습 탭 위치 복구·유지 훅 (이슈 #52, ADR-0021) — 같은 userId+setId의 view·index만 sessionStorage에서 다룬다.
 * - 세트 로드 시 1회 복원한 뒤, view·index가 바뀔 때마다 저장한다.
 * - 제출 완료 세트에서 result가 아니면 active로 정정해 오래된 탭 위치가 잘못된 화면을 만들지 않는다.
 */
export function useTabState(userId: string, setId: string | null, set: StudyActiveSet | null, s: StudyUiState): void {
  const restoredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!setId || !set || restoredRef.current === setId) return;
    restoredRef.current = setId;
    const saved = loadTabState(userId, setId);
    if (!saved) return;
    const view = saved.view === 'result' && set.status !== 'submitted' ? 'active' : saved.view;
    s.setView(view);
    s.setIndex(Math.min(saved.index, Math.max(0, set.items.length - 1)));
  }, [setId, set, userId, s]);

  useEffect(() => {
    if (!setId || restoredRef.current !== setId) return;
    persistTabState(userId, setId, { view: s.view, index: s.index });
  }, [userId, setId, s.view, s.index]);
}
