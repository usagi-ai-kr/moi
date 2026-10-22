import type { ReviewAttempt, ReviewQuestionStats } from './types';
import { REVIEW_WEIGHT_BASE } from './thresholds';

/**
 * 이력 보존·개정 가중치 규칙 (이슈 #51, ADR-0020):
 * - 오답/Pass/미응답 제출 이력은 계정별 영구 보존하고 '현재 복습 필요' 표시와 분리한다.
 * - 다시 정답이어도 이력(history)은 지우지 않는다 — 가중치 누적과 표시는 별개 상태.
 * - 오탈자/의미 동일(editorial) 개정: 유효 누적 오답 가중치를 유지한다.
 * - 정답·문제 조건·실질적 보기(substantive) 개정: 새 버전 가중치를 초기화(0)하고
 *   미풀이로 취급하되 원본 이력·북마크는 보존한다.
 * - 개정 유형 판정은 문제은행 검수 측이 입력한다(도메인은 유형만 따른다).
 */

export type RevisionKind = 'editorial' | 'substantive';

export interface RevisionChange {
  readonly kind: RevisionKind;
  readonly questionVersionId: string;
  readonly versionNo: number;
}

export function makeInitialStats(input: {
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly versionNo: number;
  readonly bookmarked?: boolean;
}): ReviewQuestionStats {
  return {
    questionId: input.questionId,
    questionVersionId: input.questionVersionId,
    versionNo: input.versionNo,
    validWrongCount: 0,
    attempted: false,
    reviewNeeded: false,
    bookmarked: input.bookmarked ?? false,
    history: [],
  };
}

/**
 * 제출 이력 기록 — 오답/Pass/미응답은 유효 오답으로 1회 누적하고 복습 필요 표시를 켠다.
 * 정답은 표시를 끄지만 이력·누적 횟수는 보존한다(영구 이력 + 표시 분리).
 */
export function recordAttempt(stats: ReviewQuestionStats, attempt: ReviewAttempt): ReviewQuestionStats {
  const history = [...stats.history, attempt];
  if (attempt.correct) {
    return { ...stats, history, attempted: true, reviewNeeded: false };
  }
  return {
    ...stats,
    history,
    attempted: true,
    reviewNeeded: true,
    validWrongCount: stats.validWrongCount + 1,
  };
}

/** 개정 반영 — editorial은 가중치 유지, substantive는 새 버전 가중치 초기화·미풀이(이력·북마크 보존). */
export function applyRevision(stats: ReviewQuestionStats, change: RevisionChange): ReviewQuestionStats {
  const base = { ...stats, questionVersionId: change.questionVersionId, versionNo: change.versionNo };
  if (change.kind === 'editorial') return base;
  return {
    ...base,
    validWrongCount: 0,
    attempted: false,
    // 미풀이 새 버전이므로 현재 복습 필요 표시는 꺼진다(원본 이력은 history에 그대로 보존).
    reviewNeeded: false,
  };
}

/** 현재 복습 가중치 — 오답 0이어도 기본 가중치로 후보가 된다(항상 맞힌 문제 포함). */
export function currentWeight(stats: ReviewQuestionStats): number {
  return REVIEW_WEIGHT_BASE + Math.max(0, stats.validWrongCount);
}
