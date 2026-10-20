import { assertSessionOwned } from '@/domain/review/invariants';
import { planReviewRound, rejoinPending, remainingAfterPick } from '@/domain/review/round-queue';
import { buildReviewSession, endSession, gradeCurrent, isExhausted, summarize } from '@/domain/review/session';
import { REVIEW_MIN_CANDIDATES } from '@/domain/review/thresholds';
import type { ReviewAttempt, ReviewCandidate, ReviewMode, ReviewResponse, ReviewSession } from '@/domain/review/types';
import type { ReviewCandidateInput, ReviewDeps } from './ports';

/**
 * 오답·북마크 복습 use case (이슈 #51, ADR-0020/ADR-0059).
 * - 모드별 독립 회차·queue: 계정·시험·모드당 활성 1개, plan remaining에서 최대 10문항 스냅샷.
 * - 한 문제씩 즉시 채점, 사용자가 직접 종료(미채점은 오답 아님, pending은 remaining에 재입대).
 * - 다른 사용자/시험 세션 접근 금지(소유권 가드). 원자 Port만 사용한다(#54).
 */

export type StartReviewResult =
  | { readonly outcome: 'started'; readonly session: ReviewSession }
  | { readonly outcome: 'rejected'; readonly reason: 'active_session_exists' | 'no_candidates' };

export type AnswerReviewResult =
  | { readonly outcome: 'answered'; readonly correct: boolean; readonly attempt: ReviewAttempt; readonly session: ReviewSession }
  | { readonly outcome: 'rejected'; readonly reason: 'not_found' | 'not_current' | 'already_graded' | 'unknown_option' | 'conflict' };

export type EndReviewResult =
  | { readonly outcome: 'ended'; readonly session: ReviewSession; readonly summary: ReturnType<typeof summarize> }
  | { readonly outcome: 'rejected'; readonly reason: 'not_found' | 'conflict' };

export type ResumeReviewResult = { readonly outcome: 'resumed'; readonly session: ReviewSession } | { readonly outcome: 'none' };

function toCandidate(input: ReviewCandidateInput): ReviewCandidate {
  return {
    questionId: input.questionId,
    validWrongCount: input.validWrongCount,
    version: {
      questionVersionId: input.version.questionVersionId,
      versionNo: input.version.versionNo,
      optionIds: [...input.version.optionIds],
      answerOptionIds: [...input.version.answerOptionIds],
    },
  };
}

async function listCandidates(deps: ReviewDeps, input: { userId: string; examId: string; mode: ReviewMode }) {
  const rows =
    input.mode === 'wrong' ? await deps.source.listWrongCandidates(input) : await deps.source.listBookmarkCandidates(input);
  return rows.map(toCandidate);
}

function toEndedQueue(session: ReviewSession | null) {
  if (session === null) return null;
  return {
    itemIds: session.items.map((i) => i.questionId),
    remaining: session.remainingQuestionIds ?? null,
    cycle: session.cycleQuestionIds ?? null,
  };
}

/** 후보 뷰 — total은 plan된 remaining 개수, items는 호환용 전체 목록이다(ADR-0059). */
export async function getReviewCandidatesView(
  deps: ReviewDeps,
  input: { userId: string; examId: string; mode: ReviewMode },
): Promise<{ candidates: ReviewCandidate[]; total: number }> {
  const candidates = await listCandidates(deps, input);
  const lastEnded = await deps.repository.findLastEnded(input);
  const plan = planReviewRound({ currentIds: candidates.map((c) => c.questionId), lastEnded: toEndedQueue(lastEnded) });
  return { candidates, total: plan.remaining.length };
}

/** 회차 시작 — plan remaining에서 모드 가중치로 최대 10문항을 뽑아 스냅샷·queue를 저장한다. */
export async function startReviewSession(deps: ReviewDeps, input: { userId: string; examId: string; mode: ReviewMode }): Promise<StartReviewResult> {
  const active = await deps.repository.findActive(input);
  if (active !== null) return { outcome: 'rejected', reason: 'active_session_exists' };
  const candidates = await listCandidates(deps, input);
  if (candidates.length < REVIEW_MIN_CANDIDATES) return { outcome: 'rejected', reason: 'no_candidates' };
  const lastEnded = await deps.repository.findLastEnded(input);
  const plan = planReviewRound({ currentIds: candidates.map((c) => c.questionId), lastEnded: toEndedQueue(lastEnded) });
  const remainingSet = new Set(plan.remaining);
  const remainingCandidates = candidates.filter((c) => remainingSet.has(c.questionId));
  const base = buildReviewSession({
    id: crypto.randomUUID(),
    userId: input.userId,
    examId: input.examId,
    mode: input.mode,
    candidates: remainingCandidates,
    createdAt: deps.clock.now(),
    rng: () => deps.rng.next(),
  });
  const picked = base.items.map((i) => i.questionId);
  const session: ReviewSession = { ...base, remainingQuestionIds: remainingAfterPick(plan.remaining, picked), cycleQuestionIds: plan.cycle };
  await deps.repository.save({ session });
  return { outcome: 'started', session };
}

/** 한 문제 즉시 채점 — 현재 커서 문제만, 회차+attempt 원자 저장 성공 시만 answered다. */
export async function answerReviewItem(
  deps: ReviewDeps,
  input: { userId: string; examId: string; mode: ReviewMode; questionId: string; response: ReviewResponse; expectedCursor?: number },
): Promise<AnswerReviewResult> {
  const active = await deps.repository.findActive(input);
  if (active === null) return { outcome: 'rejected', reason: input.expectedCursor === undefined ? 'not_found' : 'conflict' };
  if (!assertSessionOwned(active, input)) return { outcome: 'rejected', reason: 'not_found' };
  if (input.expectedCursor !== undefined && (!Number.isInteger(input.expectedCursor) || active.cursor !== input.expectedCursor)) {
    return { outcome: 'rejected', reason: 'conflict' };
  }
  const graded = gradeCurrent(active, { questionId: input.questionId, response: input.response, now: deps.clock.now() });
  if ('outcome' in graded) return { outcome: 'rejected', reason: graded.reason === 'not_active' ? 'not_found' : graded.reason };
  const outcome = graded.attempt.response.kind === 'pass' ? 'pass' : graded.correct ? 'correct' : 'wrong';
  const committed = await deps.grading.commit({
    session: graded.session,
    expectedCursor: active.cursor,
    attempt: {
      attemptId: `${graded.session.id}:${input.questionId}`,
      userId: input.userId,
      examId: input.examId,
      questionId: input.questionId,
      questionVersionId: graded.attempt.questionVersionId,
      outcome,
      occurredAt: deps.clock.now() * 1000,
    },
  });
  if (!committed) return { outcome: 'rejected', reason: 'conflict' };
  return { outcome: 'answered', correct: graded.correct, attempt: graded.attempt, session: graded.session };
}

/** 회차 종료 — pending은 remaining에 재입대해 다음 회차에서 다시 본다(채점분은 소비). */
export async function endReviewSession(deps: ReviewDeps, input: { userId: string; examId: string; mode: ReviewMode }): Promise<EndReviewResult> {
  const active = await deps.repository.findActive(input);
  if (active === null || !assertSessionOwned(active, input)) return { outcome: 'rejected', reason: 'not_found' };
  const ended = endSession(active, { now: deps.clock.now() });
  if ('outcome' in ended) return { outcome: 'rejected', reason: 'not_found' };
  const pending = ended.session.items.filter((i) => i.state.kind === 'pending').map((i) => i.questionId);
  const baseRemaining = active.remainingQuestionIds ?? [];
  const baseCycle = active.cycleQuestionIds ?? active.items.map((i) => i.questionId);
  const withQueue: ReviewSession = {
    ...ended.session,
    remainingQuestionIds: rejoinPending(baseRemaining, pending),
    cycleQuestionIds: baseCycle,
  };
  const saved = await deps.repository.end({ session: withQueue, expectedCursor: active.cursor });
  if (!saved) return { outcome: 'rejected', reason: 'conflict' };
  return { outcome: 'ended', session: withQueue, summary: summarize(withQueue) };
}

/** 이어풀기 — 재방문해도 회차 스냅샷(대상·순서·커서)이 그대로다. */
export async function resumeReviewSession(deps: ReviewDeps, input: { userId: string; examId: string; mode: ReviewMode }): Promise<ResumeReviewResult> {
  const active = await deps.repository.findActive(input);
  if (active === null || !assertSessionOwned(active, input)) return { outcome: 'none' };
  return { outcome: 'resumed', session: active };
}

/** 회차 소진 여부 — true면 다음 시작은 queue plan으로 remaining에서 다시 뽑는다. */
export function isSessionExhausted(session: ReviewSession): boolean {
  return isExhausted(session);
}

/** 북마크 추가/해제 — 개인별 독립 상태. 진행 중 회차 대상에는 영향 없음(다음 회차부터 반영). */
export async function toggleBookmark(deps: ReviewDeps, input: { userId: string; questionId: string }): Promise<{ bookmarked: boolean }> {
  return deps.source.toggleBookmark(input);
}

/** 북마크 명시 상태 SET 멱등 — HTTP PATCH용. 토글 모사 금지, 시험격리·없는문제 거부는 소스가 강제한다. */
export async function setReviewBookmark(
  deps: ReviewDeps,
  input: { userId: string; examId: string; questionId: string; bookmarked: boolean },
): Promise<{ bookmarked: boolean }> {
  return deps.source.setBookmark(input);
}
