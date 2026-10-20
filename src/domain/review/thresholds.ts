/**
 * 복습 도메인 상수·임계치와 근거 (이슈 #51, ADR-0020).
 * 값 변경은 복습 계약 변경이므로 ADR로 기록한다.
 */

/** 오답 복습 가중치 기본값 — 오답 0(항상 맞힌·개정 직후 미풀이)도 후보가 된다(ADR-0020 "1+validWrongCount"). */
export const REVIEW_WEIGHT_BASE = 1;

/** 유효 오답 1회당 가중치 증가량 — 선형 가중(1+wrongCount)이라 오답 차이를 비율로 보존하고 과가중이 없다.
 * 학습 취약 추천(#49 `WRONG_COUNT_WEIGHT_STEP`)과 동일 계약을 사용한다. */
export const REVIEW_WEIGHT_STEP = 1;

/** 회차 최소 후보 수 — 후보 0만 거부한다(ADR-0059도 유지). */
export const REVIEW_MIN_CANDIDATES = 1;

/** 한 회차 문제 수 — 대기 후보가 많으면 10문항씩 분할한다(ADR-0059). */
export const REVIEW_ROUND_SIZE = 10;
