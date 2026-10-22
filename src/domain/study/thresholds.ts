/**
 * 학습 세트 상수·임계치와 근거 (이슈 #49, ADR-0020/0019/0046/0081).
 * 값 변경은 학습 계약 변경이므로 ADR로 기록한다.
 */

/** 레거시 세트 크기 — 기존 10/20문제 세트 읽기·제출 호환용(ADR-0046/0081). */
export const STUDY_SET_SIZE = 10;

/** 새 학습 세트에서 선택 가능한 문제 수(ADR-0081). */
export const STUDY_SET_SIZE_OPTIONS = [4, 8] as const;
export type StudySetSize = (typeof STUDY_SET_SIZE_OPTIONS)[number];

/** 새 학습 세트 기본 문제 수(ADR-0081). */
export const DEFAULT_STUDY_SET_SIZE: StudySetSize = 4;

/** 별칭 — 테스트·호환용. */
export const STUDY_SET_SIZES = STUDY_SET_SIZE_OPTIONS;
export const ALLOWED_STUDY_SET_SIZES = STUDY_SET_SIZE_OPTIONS;

export function isStudySetSize(value: unknown): value is StudySetSize {
  return value === 4 || value === 8;
}

/**
 * 공식 영역 비중(150/130/120/100) — 전체 범위 모드의 가중 무작위에 사용한다.
 * 근거: ADR-0019의 500문제 영역 배분. 출제 풀은 시험 영역 weight(percent)를 그대로
 * `domainWeight`로 반영하며 이 상수는 SAA-C03의 목표값 계약이다.
 */
export const OFFICIAL_DOMAIN_SHARES: Readonly<Record<string, number>> = {
  security: 150,
  resilience: 130,
  performance: 120,
  'cost-optimization': 100,
};

/** 취약 영역 모드 가중치 기본값 — 오답 횟수 0(항상 맞힌 문제)도 이 가중치로 선택 가능하다(ADR-0020). */
export const WEAK_WEIGHT_BASE = 1;

/** 오답 1회당 가중치 증가량 — "유효 누적 오답 횟수 가중"의 선형 정의(1+wrongCount).
 * 근거: 단순 비례 가중은 오답 횟수 차이를 비율로 보존하며 과가중이 없다. */
export const WRONG_COUNT_WEIGHT_STEP = 1;

/** 정답률 스케일 — 0~100 정수 퍼센트(Math.round). 사용자 이해·비교의 표준 스케일. */
export const ACCURACY_SCALE = 100;