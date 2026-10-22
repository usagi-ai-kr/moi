import type { SaaDomain } from './types';

/**
 * 품질 검사 임계치 상수 — 근거를 주석으로 남긴다(이슈 #48, ADR-0019 자동 검수).
 * 값 변경은 품질 계약 변경이므로 ADR로 기록한다.
 */

/** 정답 선택지 길이 편향 — 정답 길이가 오답 중앙값의 1.6배를 초과하면 "유독 긴 정답"으로 판정한다.
 * 근거: 같은 개념군의 선택지는 통상 ±50% 내에서 길이가 변동한다. 1.6은 그 상한(중앙값+60%)을 넘어
 * 시험 응시자가 길이만으로 정답을 짐작할 수 있는 수준을 뜻하는 실무 임계치다. */
export const OPTION_LENGTH_BIAS_RATIO = 1.6;

/** 정보량 편향 — 정답 선택지에 쉼표·마침표·구분점이 3개 이상(문장 끝 제외)이고 모든 오답이 0개면
 * "정답만 상세 나열"로 판정한다. 근거: 서비스/설정 항목 3개 이상 나열은 정보량 단서의 최소 패턴이며,
 * 오답이 전부 단일 구일 때만 유의미하다. */
export const OPTION_DETAIL_MIN_SEPARATORS = 3;

/** 해설 길이 — 권장 1~2문장(ADR-0019)이지만 정보밀도를 유지하는 3문장까지 허용하고,
 * 4문장 이상은 과길이로 실패한다. 근거: 핵심 해설의 읽기 부담 상한(스캔 가능성). */
export const EXPLANATION_MAX_SENTENCES = 3;

/** 정답 위치 편향 — 배치 내 단일 정답 문제의 정답 option index 분포에서 한 위치의 비중이
 * 40%를 초과하면 실패한다. 근거: 4~5개 보기에서 균등 기대치는 20~25%이며 40%는 균등 배치 실패를
 * 분명히 드러내는 수준이다. */
export const ANSWER_POSITION_MAX_SHARE = 0.4;

/** 위치 편향 판정 최소 표본 — 단일 정답 문제가 8개 미만이면 비중 통계가 불안정해 판정하지 않는다.
 * 근거: 8개는 4보기 균등 배치에서 위치당 기대 2개 — 40% 임계치(3.2개)와 구분되는 최소 크기. */
export const ANSWER_POSITION_MIN_SAMPLE = 8;

/** 영역 분포 허용 편차 — 최초 공개 500문제 전량 배치는 영역 목표(150/130/120/100)를 정확히 일치시키고,
 * 그 외 부분 배치는 영역별 목표 비중 대비 ±10%p(절대) 이내를 허용한다.
 * 근거: 500은 ADR-0019의 배포 조건(전량 정확 배분), 부분 배치는 생성 중간 검수의 경과적 성격을 반영. */
export const DOMAIN_DISTRIBUTION_TOLERANCE = 0.1;

/** 최초 공개 전량 배치 크기 (ADR-0019: 최초 공개 정확히 500문제). */
export const FULL_BATCH_SIZE = 500;

/** 영역 목표 수 (ADR-0019). */
export const DOMAIN_TARGETS: Readonly<Record<SaaDomain, number>> = {
  security: 150,
  resilience: 130,
  performance: 120,
  'cost-optimization': 100,
};
