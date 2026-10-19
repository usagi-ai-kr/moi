import { assertSessionOwned } from '@/domain/review/invariants';
import { buildReviewSession, endSession, gradeCurrent, isExhausted, summarize } from '@/domain/review/session';
import { REVIEW_MIN_CANDIDATES } from '@/domain/review/thresholds';
import type {
  ReviewAttempt,
  ReviewCandidate,
  ReviewMode,
  ReviewResponse,
  ReviewSession,
} from '@/domain/review/types';
import type { ReviewCandidateInput, ReviewDeps } from './ports';

/**
 * 오답·북마크 복습 use case (이슈 #51, ADR-0020).
 * - 모드별 독립 회차: 계정·시험·모드당 활성 회차 1개, 시작 시 대상·순서 스냅샷 고정.
 * - 한 문제씩 즉시 채점, 문제 수·시간 제한 없음, 사용자가 직접 종료(미채점은 오답 아님).
 * - 대상 소진 후 다음 회차는 소스의 최신 목록을 다시 섞는다.
 * - 다른 사용자/시험 세션 접근 금지(소유권 가드).
 * - 채점은 원자 Port로 회차+attempt를 함께 저장한다(#54, 필수주입·fallback 금지).
 */

export type StartReviewResult =
  | { readonly outcome: 'started'; readonly session: ReviewSession }
  | { readonly outcome: 'rejected'; readonly reason: 'active_session_exists' | 'no_candidates' };

export type AnswerReviewResult =
  | {
      readonly outcome: 'answered';
      readonly correct: boolean;
      readonly attempt: ReviewAttempt;
      readonly session: ReviewSession;
    }
  | {
      readonly outcome: 'rejected';
      readonly reason: 'not_found' | 'not_current' | 'already_graded' | 'unknown_option' | 'conflict';
    };

export type EndReviewResult =
  | { readonly outcome: 'ended'; readonly session: ReviewSession; readonly summary: ReturnType<typeof summarize> }
  | { readonly outcome: 'rejected'; readonly reason: 'not_found' | 'conflict' };

export type ResumeReviewResult =
  | { readonly outcome: 'resumed'; readonly session: ReviewSession }
  | { readonly outcome: 'none' };

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
    input.mode === 'wrong'
      ? await deps.source.listWrongCandidates(input)
      : await deps.source.listBookmarkCandidates(input);
  return rows.map(toCandidate);
}

/** 회차 시작 — 대상 0이 아니면 최신 목록을 모드별 가중치로 섞어 스냅샷 고정한다. */
export async function startReviewSession(
  deps: ReviewDeps,
  input: { userId: string; examId: string; mode: ReviewMode },
): Promise<StartReviewResult> {
  const active = await deps.repository.findActive(input);
  if (active !== null) return { outcome: 'rejected', reason: 'active_session_exists' };
  const candidates = await listCandidates(deps, input);
  if (candidates.length < REVIEW_MIN_CANDIDATES) return { outcome: 'rejected', reason: 'no_candidates' };
  const session = buildReviewSession({
    id: crypto.randomUUID(),
    userId: input.userId,
    examId: input.examId,
    mode: input.mode,
    candidates,
    createdAt: deps.clock.now(),
    rng: () => deps.rng.next(),
  });
  await deps.repository.save({ session });
  return { outcome: 'started', session };
}

/** 한 문제 즉시 채점 — 현재 커서 문제만, 회차+attempt 원자 저장 성공 시만 answered다. */
export async function answerReviewItem(
  deps: ReviewDeps,
  input: { userId: string; examId: string; mode: ReviewMode; questionId: string; response: ReviewResponse; expectedCursor?: number },
): Promise<AnswerReviewResult> {
  const active = await deps.repository.findActive(input);
  if (active === null) {
    return { outcome: 'rejected', reason: input.expectedCursor === undefined ? 'not_found' : 'conflict' };
  }
  if (!assertSessionOwned(active, input)) return { outcome: 'rejected', reason: 'not_found' };
  if (input.expectedCursor !== undefined && (!Number.isInteger(input.expectedCursor) || active.cursor !== input.expectedCursor)) {
    return { outcome: 'rejected', reason: 'conflict' };
  }
  const graded = gradeCurrent(active, { questionId: input.questionId, response: input.response, now: deps.clock.now() });
  if ('outcome' in graded) {
    // 이미 활성 세션을 확인했으므로 not_active는 소멸 상태 경합으로 보고 not_found로 통일한다.
    return { outcome: 'rejected', reason: graded.reason === 'not_active' ? 'not_found' : graded.reason };
  }
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
  // CAS 실패·batch 0행·롤백은 409 경합으로 알리고 쓰기 없음을 보장한다(성공 위장 금지).
  if (!committed) return { outcome: 'rejected', reason: 'conflict' };
  return { outcome: 'answered', correct: graded.correct, attempt: graded.attempt, session: graded.session };
}

/** 회차 종료 — 사용자 직접 종료. 미채점 문제는 오답 처리하지 않고 그대로 남긴다. */
export async function endReviewSession(
  deps: ReviewDeps,
  input: { userId: string; examId: string; mode: ReviewMode },
): Promise<EndReviewResult> {
  const active = await deps.repository.findActive(input);
  if (active === null || !assertSessionOwned(active, input)) return { outcome: 'rejected', reason: 'not_found' };
  const ended = endSession(active, { now: deps.clock.now() });
  if ('outcome' in ended) return { outcome: 'rejected', reason: 'not_found' };
  const saved = await deps.repository.end({ session: ended.session, expectedCursor: active.cursor });
  if (!saved) return { outcome: 'rejected', reason: 'conflict' };
  return { outcome: 'ended', session: ended.session, summary: summarize(ended.session) };
}

/**
 * 이어풀기 — 재방문해도 회차 스냅샷(대상·순서·커서)이 그대로다.
 * 소진된 회차를 재방문하면 `exhausted`로 알리고 새 회차 시작을 안내한다.
 */
export async function resumeReviewSession(
  deps: ReviewDeps,
  input: { userId: string; examId: string; mode: ReviewMode },
): Promise<ResumeReviewResult> {
  const active = await deps.repository.findActive(input);
  if (active === null || !assertSessionOwned(active, input)) return { outcome: 'none' };
  return { outcome: 'resumed', session: active };
}

/** 회차 소진 여부 — true면 다음 시작은 소스의 최신 목록을 다시 섞는다(도메인은 시작 시 매번 재조회). */
export function isSessionExhausted(session: ReviewSession): boolean {
  return isExhausted(session);
}

/** 북마크 추가/해제 — 개인별 독립 상태. 진행 중 회차 대상에는 영향 없음(다음 회차부터 반영). */
export async function toggleBookmark(
  deps: ReviewDeps,
  input: { userId: string; questionId: string },
): Promise<{ bookmarked: boolean }> {
  return deps.source.toggleBookmark(input);
}

/** 북마크 명시 상태 SET 멱등 — HTTP PATCH용. 토글 모사 금지, 시험격리·없는문제 거부는 소스가 강제한다. */
export async function setReviewBookmark(
  deps: ReviewDeps,
  input: { userId: string; examId: string; questionId: string; bookmarked: boolean },
): Promise<{ bookmarked: boolean }> {
  return deps.source.setBookmark(input);
}
