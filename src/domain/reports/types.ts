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

/** 재검수 상태 — queued(대기) | running(실행 중) | succeeded(성공 종료) | failed(실패·재시도 가능). */
export type RecheckStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** 재검수 시도 상태 — 순수 전이 입력/출력. 시간은 epoch ms. */
export interface RecheckState {
  /** 현재 상태. */
  readonly status: RecheckStatus;
  /** 누적 시작 횟수 — `startRecheck`에서만 증가. */
  readonly attempts: number;
  /** 마지막 실패 종료 시각 — 미실패 시 null. */
  readonly lastAttemptAt: number | null;
  /** 실행 시작 시각 — running 동안 유효, 그 외는 마지막 시작 시각 유지(null 가능). */
  readonly startedAt: number | null;
}

/** 재검수 시작 옵션 — runId는 외부 추적용(상태 저장 안 함). */
export interface StartRecheckOptions {
  /** 현재 시각(epoch ms). */
  readonly now: number;
  /** 실행 추적 ID(선택). */
  readonly runId?: string;
}

/** 재검수 종료 옵션. */
export interface FinishRecheckOptions {
  /** 현재 시각(epoch ms). */
  readonly now: number;
  /** 종료 결과. */
  readonly outcome: 'succeeded' | 'failed';
  /** 실패 사유(선택). */
  readonly reason?: string;
}
