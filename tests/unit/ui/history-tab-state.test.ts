import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HISTORY_TAB,
  HISTORY_TABS,
  isHistoryTab,
  parseTabParam,
  resolveHistoryTab,
} from '../../../src/ui/history/history-tab-state';

// #224 AC-5 URL 계약 — ?tab= 단일 진실 원천, 해석 우선순위·replace 판정 (o 확정).
describe('history tab state (AC-5)', () => {
  it('허용 탭은 summary|domains|completed 3개이며 기본은 summary다', () => {
    expect([...HISTORY_TABS]).toEqual(['summary', 'domains', 'completed']);
    expect(DEFAULT_HISTORY_TAB).toBe('summary');
  });

  it('isHistoryTab은 허용값만 true다', () => {
    expect(isHistoryTab('summary')).toBe(true);
    expect(isHistoryTab('domains')).toBe(true);
    expect(isHistoryTab('completed')).toBe(true);
    expect(isHistoryTab('unknown')).toBe(false);
    expect(isHistoryTab('')).toBe(false);
    expect(isHistoryTab(null)).toBe(false);
  });

  it('parseTabParam은 유효값 그대로, 그 외는 summary 기본값이다', () => {
    expect(parseTabParam('summary')).toBe('summary');
    expect(parseTabParam('domains')).toBe('domains');
    expect(parseTabParam('completed')).toBe('completed');
    expect(parseTabParam('unknown')).toBe('summary');
    expect(parseTabParam(null)).toBe('summary');
    expect(parseTabParam('')).toBe('summary');
  });

  it('① 유효 tab이 있으면 그 값을 쓰고 replace하지 않는다', () => {
    expect(resolveHistoryTab('domains', null)).toEqual({ tab: 'domains', needsReplace: false });
    expect(resolveHistoryTab('completed', '2')).toEqual({ tab: 'completed', needsReplace: false });
    expect(resolveHistoryTab('summary', '3')).toEqual({ tab: 'summary', needsReplace: false });
  });

  it('② tab이 없고 page가 있으면 completed로 해석하고 replace한다', () => {
    expect(resolveHistoryTab(null, '2')).toEqual({ tab: 'completed', needsReplace: true });
    expect(resolveHistoryTab(null, 'abc')).toEqual({ tab: 'completed', needsReplace: true });
  });

  it('③ 그 외(tab·page 모두 없음)는 summary이며 URL을 건드리지 않는다', () => {
    expect(resolveHistoryTab(null, null)).toEqual({ tab: 'summary', needsReplace: false });
  });

  it('잘못된 tab은 summary로 replace한다 (히스토리 오염 방지)', () => {
    expect(resolveHistoryTab('unknown', null)).toEqual({ tab: 'summary', needsReplace: true });
    expect(resolveHistoryTab('unknown', '2')).toEqual({ tab: 'summary', needsReplace: true });
  });
});
