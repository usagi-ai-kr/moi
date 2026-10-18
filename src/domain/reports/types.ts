/**
 * 신고율·자동 중지 도메인 타입 (이슈 #53, ADR-0021 "결정 — 신고·검수·정정").
 * - 순수 TS: 외부 패키지·DB·네트워크 의존 금지(ADR-0001).
 * - 문제 버전 기준: 고유 신고 계정 / 해당 버전을 푼 고유 계정.
 * - 소급 정정·Cron·HTTP는 범위 밖이다.
 */

/** 신고 사유 4종 — 정답 오류·해설 오류·모호함·오탈자. */
export type ReportReason = 'answer' | 'explanation' | 'ambiguous' | 'typo';

/** 신고율 계산 입력 — 중복 포함 가능(함수内で Set 중복 제거). */
export interface ReportRateInput {
  /** 신고 계정 ID 목록(중복 포함 가능). */
  readonly reporterIds: readonly string[];
  /** 해당 버전을 푼 고유 계정 ID 목록(세트 제출에 해당 버전 포함). */
  readonly solvedUserIds: readonly string[];
}

/** 신고율 계산 결과. */
export interface ReportRateResult {
  /** 고유 신고자 수 = |set(reporterIds)|. */
  readonly uniqueReporters: number;
  /** 푼 고유 계정 수 = |set(solvedUserIds)|. */
  readonly solvedUsers: number;
  /** 신고율 = solvedUsers === 0 ? null : uniqueReporters / solvedUsers. */
  readonly rate: number | null;
  /** 자동 출제 중지: 고유 신고자 ≥5 AND rate ≥0.10. */
  readonly autoStop: boolean;
  /** 재검수 대기열 대상: 신고 ≥1 (자동 중지와 별도 필드). */
  readonly requiresRecheck: boolean;
}
