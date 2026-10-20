import type { ReviewCandidate, ReviewItemState, ReviewMode, ReviewSession, ReviewSessionItem } from './types';
import { pickOrder, shuffle } from './selection';
import { REVIEW_ROUND_SIZE } from './thresholds';
import { assertReviewSessionInvariants } from './invariants';

/**
 * 회차 스냅샷·종료 (이슈 #51, ADR-0020/ADR-0059):
 * - 시작 시 대상·순서·개정·보기 순서를 고정하고 회차 내 중복을 금지한다.
 * - 회차 중 대상 증감은 다음 회차부터 반영된다(스냅샷 불변).
 * - 10문항 단위(ROUND_SIZE): 한 회차는 plan된 remaining에서 최대 10문항이다.
 * - 종료 후 변경·재채점 금지, 미채점(pending) 문제는 종료 시에도 오답 처리하지 않는다.
 * - 즉시 채점은 `grading.ts`의 gradeCurrent가 담당한다.
 */

export { gradeCurrent, type GradeRejection, type GradeResult } from './grading';

export interface ReviewSessionDraft {
  readonly id: string;
  readonly userId: string;
  readonly examId: string;
  readonly mode: ReviewMode;
  readonly candidates: readonly ReviewCandidate[];
  readonly createdAt: number;
  readonly rng: () => number;
}

/** 시작 시 대상·순서 고정 — 소진 후 다음 회차는 queue plan으로 remaining에서 다시 뽑는다. */
export function buildReviewSession(draft: ReviewSessionDraft): ReviewSession {
  const ordered = pickOrder(draft.candidates, draft.mode, draft.rng).slice(0, REVIEW_ROUND_SIZE);
  const items: ReviewSessionItem[] = ordered.map((candidate) => ({
    questionId: candidate.questionId,
    questionVersionId: candidate.version.questionVersionId,
    versionNo: candidate.version.versionNo,
    optionIds: [...candidate.version.optionIds],
    answerOptionIds: [...candidate.version.answerOptionIds],
    optionOrder: shuffle(candidate.version.optionIds, draft.rng),
    state: { kind: 'pending' } as ReviewItemState,
  }));
  const session: ReviewSession = {
    id: draft.id,
    userId: draft.userId,
    examId: draft.examId,
    mode: draft.mode,
    status: 'active',
    createdAt: draft.createdAt,
    cursor: 0,
    items,
  };
  assertReviewSessionInvariants(session);
  return session;
}

export type EndOutcome =
  | { readonly session: ReviewSession }
  | { readonly outcome: 'rejected'; readonly reason: 'not_active' };

/**
 * 회차 종료 — 사용자가 직접 종료한다(10문항 단위, 문제 수·시간 제한 없음).
 * 미채점(pending) 문제는 오답 처리하지 않고 그대로 남긴다. 종료 후 채점·변경은 금지다.
 */
export function endSession(session: ReviewSession, input: { readonly now: number }): EndOutcome {
  if (session.status !== 'active') return { outcome: 'rejected', reason: 'not_active' };
  const next: ReviewSession = { ...session, status: 'ended', endedAt: input.now };
  assertReviewSessionInvariants(next);
  return { session: next };
}

/** 회차 진행 요약 — 채점/미채점 집계(미채점은 오답이 아니다). */
export function summarize(session: ReviewSession): {
  readonly total: number;
  readonly graded: number;
  readonly pending: number;
  readonly correct: number;
} {
  let graded = 0;
  let correct = 0;
  for (const item of session.items) {
    if (item.state.kind === 'graded') {
      graded += 1;
      if (item.state.correct) correct += 1;
    }
  }
  return { total: session.items.length, graded, pending: session.items.length - graded, correct };
}

/** 대상 소진 여부 — 회차 내 모든 문제가 채점되면 다음 회차에서 최신 목록을 다시 섞는다. */
export function isExhausted(session: ReviewSession): boolean {
  return session.items.every((item) => item.state.kind === 'graded');
}
