/**
 * 신고율·자동 중지 임계치 (이슈 #53, ADR-0021 "고유 신고 ≥5 AND ≥10%").
 * 값 변경은 신고·중지 계약 변경이므로 ADR로 기록한다.
 */

/** 자동 중지 최소 고유 신고자 수 — 5명 미만은 오신고·소수 불만에 의한 중지 남용 방지. */
export const MIN_UNIQUE_REPORTERS_FOR_STOP = 5;

/** 자동 중지 최소 신고율 — 10% 미만은 수강 규모 대비 노이즈로 보고 재검수 대기열로만 처리. */
export const MIN_REPORT_RATE_FOR_STOP = 0.1;

/** 재검수 최대 시도 횟수 — 초과 시 수동 개입 필요. 값 변경은 ADR 필요. */
export const MAX_RECHECK_ATTEMPTS = 3;

/** 재검수 재시도 간격 — 일일 Cron(24h). 값 변경은 ADR 필요. */
export const RETRY_DELAY_MS = 24 * 60 * 60 * 1000;
