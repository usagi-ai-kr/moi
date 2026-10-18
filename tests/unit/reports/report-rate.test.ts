import { describe, expect, it } from 'vitest';
import { computeReportRate } from '@/domain/reports/report-rate';

// 이슈 #53 — 신고율 경계(ADR-0021: 고유 신고 ≥5 AND ≥10% → 자동 중지, 신고 ≥1 → 재검수 대기열).
const solved = (n: number): string[] => Array.from({ length: n }, (_, i) => `solved-${i}`);
const reporters = (n: number): string[] => Array.from({ length: n }, (_, i) => `reporter-${i}`);

describe('computeReportRate', () => {
  it('4명/10명(40%): 인원 미달 → 중지 아님·대기열 등록', () => {
    const r = computeReportRate({ reporterIds: reporters(4), solvedUserIds: solved(10) });
    expect(r).toMatchObject({ uniqueReporters: 4, solvedUsers: 10, rate: 0.4, autoStop: false, requiresRecheck: true });
  });

  it('5명/10명(50%): 즉시 출제 중지', () => {
    const r = computeReportRate({ reporterIds: reporters(5), solvedUserIds: solved(10) });
    expect(r).toMatchObject({ uniqueReporters: 5, solvedUsers: 10, rate: 0.5, autoStop: true, requiresRecheck: true });
  });

  it('5명/9%대(5명/56명≈8.9%): 비율 미달 → 중지 아님·대기열 등록', () => {
    const r = computeReportRate({ reporterIds: reporters(5), solvedUserIds: solved(56) });
    expect(r.uniqueReporters).toBe(5);
    expect(r.rate).toBeCloseTo(5 / 56, 10);
    expect(r.autoStop).toBe(false);
    expect(r.requiresRecheck).toBe(true);
  });

  it('5명/100명(5%): 비율 미달 → 중지 아님·대기열 등록', () => {
    const r = computeReportRate({ reporterIds: reporters(5), solvedUserIds: solved(100) });
    expect(r).toMatchObject({ uniqueReporters: 5, solvedUsers: 100, rate: 0.05, autoStop: false, requiresRecheck: true });
  });

  it('5명/50명(정확히 10%): autoStop true', () => {
    const r = computeReportRate({ reporterIds: reporters(5), solvedUserIds: solved(50) });
    expect(r).toMatchObject({ uniqueReporters: 5, solvedUsers: 50, rate: 0.1, autoStop: true, requiresRecheck: true });
  });

  it('0명/0명: rate null·중지 아님·대기열 아님', () => {
    const r = computeReportRate({ reporterIds: [], solvedUserIds: [] });
    expect(r).toMatchObject({ uniqueReporters: 0, solvedUsers: 0, rate: null, autoStop: false, requiresRecheck: false });
  });

  it('중복 신고 5건/1명: 1명으로 집계 → 중지 아님', () => {
    const r = computeReportRate({ reporterIds: ['u1', 'u1', 'u1', 'u1', 'u1'], solvedUserIds: solved(10) });
    expect(r).toMatchObject({ uniqueReporters: 1, solvedUsers: 10, rate: 0.1, autoStop: false, requiresRecheck: true });
  });

  it('신고 0·풀이 10명: rate 0·중지 아님·대기열 아님', () => {
    const r = computeReportRate({ reporterIds: [], solvedUserIds: solved(10) });
    expect(r).toMatchObject({ uniqueReporters: 0, solvedUsers: 10, rate: 0, autoStop: false, requiresRecheck: false });
  });
});
