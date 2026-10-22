import { create } from 'zustand';
import type { SaveState, StudyScope, StudyView } from './types';

// 일시 UI 상태만 — 세트 본문·토큰 저장 금지 (ADR-0018).
export interface StudyUiState {
  view: StudyView;
  scope: StudyScope;
  domainId: string;
  size: number;
  index: number;
  save: SaveState;
  confirmSubmit: boolean;
  confirmAbandon: boolean;
  historyPage: number;
  detailId: string | null;
  setView: (v: StudyView) => void;
  setScope: (s: StudyScope) => void;
  setDomainId: (id: string) => void;
  setSize: (size: number) => void;
  setIndex: (i: number) => void;
  setSave: (s: SaveState) => void;
  setConfirmSubmit: (open: boolean) => void;
  setConfirmAbandon: (open: boolean) => void;
  setHistoryPage: (p: number) => void;
  setDetailId: (id: string | null) => void;
  resetFlow: () => void;
}

export const useStudyUiStore = create<StudyUiState>()((set) => ({
  view: 'start',
  scope: 'all',
  domainId: 'dom-security',
  size: 4,
  index: 0,
  save: 'idle',
  confirmSubmit: false,
  confirmAbandon: false,
  historyPage: 1,
  detailId: null,
  setView: (view) => set({ view }),
  setScope: (scope) => set({ scope }),
  setDomainId: (domainId) => set({ domainId }),
  setSize: (size) => set({ size }),
  setIndex: (index) => set({ index }),
  setSave: (save) => set({ save }),
  setConfirmSubmit: (open) => set({ confirmSubmit: open }),
  setConfirmAbandon: (open) => set({ confirmAbandon: open }),
  setHistoryPage: (historyPage) => set({ historyPage }),
  setDetailId: (detailId) => set({ detailId }),
  resetFlow: () => set({ index: 0, save: 'idle', confirmSubmit: false, confirmAbandon: false }),
}));
