// 학습 현황 하위 탭 URL 상태 — 순수 함수 (React 무의존, #224).
// URL 계약: ?tab=summary|domains|completed 단일 진실 원천 (o 확정).
export const HISTORY_TABS = ['summary', 'domains', 'completed'] as const;

export type HistoryTab = (typeof HISTORY_TABS)[number];

export const DEFAULT_HISTORY_TAB: HistoryTab = 'summary';

export function isHistoryTab(value: string | null): value is HistoryTab {
  return value === 'summary' || value === 'domains' || value === 'completed';
}

export function parseTabParam(raw: string | null): HistoryTab {
  return isHistoryTab(raw) ? raw : DEFAULT_HISTORY_TAB;
}

// 해석 우선순위: ① 유효 tab → 그 값 ② tab 없고 page 있음 → completed(+replace)
// ③ 그 외 → summary. 잘못된 tab → summary(+replace).
export function resolveHistoryTab(
  rawTab: string | null,
  rawPage: string | null,
): { tab: HistoryTab; needsReplace: boolean } {
  if (rawTab !== null) {
    if (isHistoryTab(rawTab)) return { tab: rawTab, needsReplace: false };
    return { tab: DEFAULT_HISTORY_TAB, needsReplace: true };
  }
  if (rawPage !== null) return { tab: 'completed', needsReplace: true };
  return { tab: DEFAULT_HISTORY_TAB, needsReplace: false };
}
