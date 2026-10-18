/**
 * 학습 현황·취약 영역 순수 도메인 타입 (이슈 #54, ADR-0021 "결정 — 학습 현황").
 * - 순수 TS: 외부 패키지·DB·네트워크 의존 금지(ADR-0001).
 * - 시험별 분리: 모든 집계는 단일 examId 기준으로만 계산한다(ADR-0021 시험별 확장).
 * - 합격 예측·고급 그래프는 범위 밖이다(ADR-0021).
 */

/**
 * 학습 결과 — 채점 가능(correct/wrong)과 비채점(pass/unanswered)을 구분한다.
 * 비채점 결과는 정답률 분모에 넣지 않고 "풀이"로도 세지 않는다.
 */
export type StudyOutcome = 'correct' | 'wrong' | 'pass' | 'unanswered';

/** 학습 이력 항목 — StudyHistoryPort가 반환하는 최소 계약. */
export interface StudyHistoryEntry {
  readonly examId: string;
  readonly questionId: string;
  readonly domainId: string;
  readonly outcome: StudyOutcome;
  /** 사건 시각(epoch ms, UTC) — StatsClock 기준 최근성 판정에 사용한다. */
  readonly occurredAt: number;
  /** 최초 풀이 표시 — true면 그 항목이 최초 시도다(미표시면 가장 이른 시도가 최초). */
  readonly firstAttempt?: boolean;
  /** 시도 식별자 — 동일 attemptId 중복 기록은 1회로 병합한다. */
  readonly attemptId?: string;
}

/** 영역별 집계 — 표본이 부족하면 accuracy가 null이고 status가 'insufficient-data'다. */
export interface DomainStats {
  readonly domainId: string;
  /** 첫 풀이(채점 가능 첫 시도) 고유 문제 수 — 영역 표본 크기이자 진도. */
  readonly uniqueFirstSolved: number;
  /** 정답률 분모로 반영된 채점 시도 수(반복 상한 적용 후). */
  readonly gradedAttempts: number;
  /** 누적 정답률(0~1) — 표본 0이면 null. */
  readonly cumulativeAccuracy: number | null;
  /** 최근 창(상수 참조) 내 정답률(0~1) — 최근 채점 시도가 없으면 null. */
  readonly recentAccuracy: number | null;
  readonly status: 'ok' | 'insufficient-data';
}

/** 취약 영역 추천 — 누적 정답률 + 최근 성과를 결합한 점수 기준 오름차순. */
export interface WeakDomainRecommendation {
  readonly domainId: string;
  /** 결합 점수(0~1, 낮을수록 취약). */
  readonly score: number;
  readonly cumulativeAccuracy: number;
  /** 최근 성과 — 최근 채점 시도가 없으면 누적값으로 대체해 계산한 값. */
  readonly effectiveRecentAccuracy: number;
  readonly uniqueFirstSolved: number;
}

/** 시험별 학습 현황 최종 결과. */
export interface StudyStats {
  readonly examId: string;
  /** 진도율 분모(기본 500 — ADR-0019 최초 공개 전량). */
  readonly totalQuestions: number;
  readonly uniqueFirstSolved: number;
  /** uniqueFirstSolved / totalQuestions (0~1). */
  readonly coverage: number;
  /** 전체 누적 정답률 — 채점 표본 0이면 null. */
  readonly overallAccuracy: number | null;
  readonly domains: readonly DomainStats[];
  readonly weakDomains: readonly WeakDomainRecommendation[];
}

/** computeStudyStats 옵션 — now는 StatsClock에서 주입한 고정 시각(결정적 테스트). */
export interface ComputeStatsOptions {
  readonly examId: string;
  readonly totalQuestions: number;
  readonly now: number;
}
