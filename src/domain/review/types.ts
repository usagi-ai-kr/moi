/**
 * 오답·북마크 복습 도메인 타입 (이슈 #51, ADR-0020).
 * - 회차 시작 시 대상·순서·개정을 스냅샷으로 고정하고 회차 내 중복을 금지한다.
 * - 제출·채점된 개별 시도는 즉시 이력으로 보존한다(미채점 문제는 종료 시 오답 처리 안 함).
 * - 계정별 오답/Pass/미응답 이력은 영구 보존하고 '현재 복습 필요' 표시와 분리한다.
 * - 외부 패키지·Drizzle 타입 의존 금지 — 영속 변환은 infra mapper가 담당한다.
 */

export type ReviewMode = 'wrong' | 'bookmark';
export type ReviewSessionStatus = 'active' | 'ended';

/** 복습 즉시 채점 입력 — 미응답(미제출)은 채점 입력이 아니므로 채점·이력에 넣지 않는다. */
export type ReviewResponse =
  | { readonly kind: 'answered'; readonly optionIds: readonly string[] }
  | { readonly kind: 'pass' };

/** 영구 이력 레코드의 응답 기록 — 학습 세트 제출의 미응답도 오답 이력으로 남긴다. */
export type ReviewAttemptResponse = ReviewResponse | { readonly kind: 'unanswered' };

/** 복습 후보 개정 스냅샷 — 회차 중 개정이 바뀌어도 채점은 이 스냅샷으로 한다. */
export interface ReviewVersionSnapshot {
  readonly questionVersionId: string;
  readonly versionNo: number;
  readonly optionIds: readonly string[];
  readonly answerOptionIds: readonly string[];
}

/** 소스(오답 이력·북마크 목록)가 주는 최신 후보 — Pass·미응답 제출도 유효 오답으로 계수된다. */
export interface ReviewCandidate {
  readonly questionId: string;
  readonly validWrongCount: number;
  readonly version: ReviewVersionSnapshot;
}

/** 회차 내 개별 문제 상태 — pending(미채점)은 종료 후에도 오답으로 바꾸지 않는다. */
export type ReviewItemState =
  | { readonly kind: 'pending' }
  | {
      readonly kind: 'graded';
      readonly response: ReviewResponse;
      readonly correct: boolean;
      readonly gradedAt: number;
    };

export interface ReviewSessionItem extends ReviewVersionSnapshot {
  readonly questionId: string;
  /** 시작 시 섞어 고정한 보기 순서 — 다른 회차는 새로 섞는다. */
  readonly optionOrder: readonly string[];
  readonly state: ReviewItemState;
}

export interface ReviewSession {
  readonly id: string;
  readonly userId: string;
  readonly examId: string;
  readonly mode: ReviewMode;
  readonly status: ReviewSessionStatus;
  readonly createdAt: number;
  readonly endedAt?: number;
  /** 다음 풀 문제 인덱스 — 모두 채점하면 items.length(ADR-0059: 한 회차 최대 10문항). */
  readonly cursor: number;
  readonly items: readonly ReviewSessionItem[];
  /** 회차 큐(ADR-0059) — remaining은 다음 plan 대상, cycle은 이번 순환 전체. null은 legacy 행. API DTO 노출 금지. */
  readonly remainingQuestionIds?: readonly string[] | null;
  readonly cycleQuestionIds?: readonly string[] | null;
}

/** 채점 즉시 보존되는 개별 복습 시도 이력 — 이후 수정·재채점 금지. */
export interface ReviewAttempt {
  readonly sessionId: string;
  readonly userId: string;
  readonly mode: ReviewMode;
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly response: ReviewAttemptResponse;
  readonly correct: boolean;
  readonly answeredAt: number;
}

/** 계정·문제별 복습 통계 — 이력(history)은 영구 보존하고 가중치·진행 상태만 개정 규칙을 따른다. */
export interface ReviewQuestionStats {
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly versionNo: number;
  /** 유효 누적 오답 횟수 — 오탈자 수정은 유지, 실질 개정은 0으로 초기화. */
  readonly validWrongCount: number;
  /** 미풀이(false) — 실질 개정 시 새 버전을 미풀이로 취급해 초기화한다. */
  readonly attempted: boolean;
  /** '현재 복습 필요' 표시 — 영구 이력·가중치와 분리된 스코프 표시. */
  readonly reviewNeeded: boolean;
  readonly bookmarked: boolean;
  /** 원본 이력 — 정답을 맞혀도 지우지 않는다. */
  readonly history: readonly ReviewAttempt[];
}
