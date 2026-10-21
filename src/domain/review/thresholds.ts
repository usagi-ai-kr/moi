/**
 * 복습 도메인 상수·임계치와 근거 (이슈 #51, ADR-0020/0081).
 * 값 변경은 복습 계약 변경이므로 ADR로 기록한다.
 */

/** 오답 복습 가중치 기본값 — 오답 0(항상 맞힌·개정 직후 미풀이)도 후보가 된다(ADR-0020 "1+validWrongCount"). */
export const REVIEW_WEIGHT_BASE = 1;

/** 유효 오답 1회당 가중치 증가량 — 선형 가중(1+wrongCount)이라 오답 차이를 비율로 보존하고 과가중이 없다.
 * 학습 취약 추천(#49 `WRONG_COUNT_WEIGHT_STEP`)과 동일 계약을 사용한다. */
export const REVIEW_WEIGHT_STEP = 1;

/** 회차 최소 후보 수 — 후보 0만 거부한다(ADR-0059도 유지). */
export const REVIEW_MIN_CANDIDATES = 1;

/** 레거시 회차 크기 — 기존 10문항 회차 읽기 호환용(ADR-0059/0081). */
export const REVIEW_ROUND_SIZE = 10;

/** 새 복습 회차에서 선택 가능한 문제 수(ADR-0081). */
export const REVIEW_ROUND_SIZE_OPTIONS = [4, 8] as const;
export type ReviewRoundSize = (typeof REVIEW_ROUND_SIZE_OPTIONS)[number];

/** 새 복습 회차 기본 문제 수(ADR-0081). */
export const DEFAULT_REVIEW_ROUND_SIZE: ReviewRoundSize = 4;

/** 별칭 — 테스트·호환용. */
export const REVIEW_ROUND_SIZES = REVIEW_ROUND_SIZE_OPTIONS;
export const ALLOWED_REVIEW_ROUND_SIZES = REVIEW_ROUND_SIZE_OPTIONS;

export function isReviewRoundSize(value: unknown): value is ReviewRoundSize {
  return value === 4 || value === 8;
}