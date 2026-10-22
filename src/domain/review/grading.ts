import type { ReviewAttempt, ReviewItemState, ReviewResponse, ReviewSession } from './types';
import { assertReviewSessionInvariants } from './invariants';

/**
 * 한 문제 즉시 채점 (이슈 #51, ADR-0020):
 * - 현재 커서 문제만 채점할 수 있다(순서 고정·회차 내 중복 0).
 * - 제출 즉시 시작 시점 개정 스냅샷의 정답으로 판정하고 시도 이력을 반환한다(재채점·수정 금지).
 * - Pass는 오답으로 채점된다. 미응답(미제출)은 채점 입력이 아니므로 이력에도 넣지 않는다.
 */

export type GradeRejection = {
  readonly outcome: 'rejected';
  readonly reason:
    | 'not_active'
    | 'not_current'
    | 'already_graded'
    | 'unknown_option'
    | 'invalid_selection_count';
};

export interface GradeResult {
  readonly session: ReviewSession;
  readonly attempt: ReviewAttempt;
  readonly correct: boolean;
}

function sameOptionSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== a.length || right.size !== b.length) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

/** 한 문제 즉시 채점 — 커서 문제만, 채점 결과는 즉시 스냅샷에 반영된다. */
export function gradeCurrent(
  session: ReviewSession,
  input: {
    readonly questionId: string;
    readonly response: ReviewResponse;
    readonly now: number;
  },
): GradeRejection | GradeResult {
  if (session.status !== 'active') return { outcome: 'rejected', reason: 'not_active' };
  const index = session.cursor;
  const item = session.items[index];
  if (item === undefined) return { outcome: 'rejected', reason: 'not_current' };
  if (item.questionId !== input.questionId) return { outcome: 'rejected', reason: 'not_current' };
  if (item.state.kind !== 'pending') return { outcome: 'rejected', reason: 'already_graded' };
  if (input.response.kind === 'answered') {
    const allowed = new Set(item.optionOrder);
    if (input.response.optionIds.length === 0 || input.response.optionIds.some((id) => !allowed.has(id))) {
      return { outcome: 'rejected', reason: 'unknown_option' };
    }
    // #308 — 문항 계약 검증: 단일 선택(정답 1개) 문항은 optionId 정확히 1개만 받는다.
    // 조작 요청이 채점·이력에 저장되지 않아 데이터가 오염되지 않는다.
    if (item.answerOptionIds.length === 1 && input.response.optionIds.length > 1) {
      return { outcome: 'rejected', reason: 'invalid_selection_count' };
    }
  }
  const correct =
    input.response.kind === 'answered' && sameOptionSet(input.response.optionIds, item.answerOptionIds);

  const state: ReviewItemState = { kind: 'graded', response: input.response, correct, gradedAt: input.now };
  const items = session.items.map((candidate, i) => (i === index ? { ...candidate, state } : candidate));
  const next: ReviewSession = { ...session, items, cursor: index + 1 };
  assertReviewSessionInvariants(next);
  const attempt: ReviewAttempt = {
    sessionId: session.id,
    userId: session.userId,
    mode: session.mode,
    questionId: item.questionId,
    questionVersionId: item.questionVersionId,
    response: input.response,
    correct,
    answeredAt: input.now,
  };
  return { session: next, attempt, correct };
}
