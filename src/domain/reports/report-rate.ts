import { MIN_REPORT_RATE_FOR_STOP, MIN_UNIQUE_REPORTERS_FOR_STOP } from './thresholds';
import type { ReportRateInput, ReportRateResult } from './types';

/**
 * 신고율·자동 중지 순수 계산 (이슈 #53, ADR-0021).
 * - 같은 계정의 반복 신고는 1명으로 중복 제거(Set).
 * - 분모 0(solvedUsers 0)이면 rate null·자동 중지 아님.
 * - 자동 중지와 재검수 대기열은 별도 필드.
 */
export function computeReportRate(input: ReportRateInput): ReportRateResult {
  const uniqueReporters = new Set(input.reporterIds).size;
  const solvedUsers = new Set(input.solvedUserIds).size;
  const rate = solvedUsers === 0 ? null : uniqueReporters / solvedUsers;
  const autoStop =
    uniqueReporters >= MIN_UNIQUE_REPORTERS_FOR_STOP && rate !== null && rate >= MIN_REPORT_RATE_FOR_STOP;
  return {
    uniqueReporters,
    solvedUsers,
    rate,
    autoStop,
    requiresRecheck: uniqueReporters >= 1,
  };
}
