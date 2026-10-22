import type { ReviewCandidate, ReviewSession } from '@/domain/review/types';
import type { ReviewClock, ReviewRng, ReviewSessionRepository, ReviewSourcePort } from '@/app/review/ports';
import type { ReviewGradingAttempt, ReviewGradingRepository } from '@/app/review/grading-ports';

/**
 * 결정적 RNG·후보 fixture (이슈 #51) — 실제 AI/DB/네트워크 미사용.
 */

/** mulberry32 유사 난수 — 고정 시드로 결정적 분포를 제공한다. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 스크립트된 값을 순서대로 반환하는 RNG — 가중 수학 검증용(초과분은 마지막 값 반복). */
export function scriptedRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

/** 복습 후보 fixture — 기본 개정 v1, 보기 a~d, 정답 'b'. */
export function makeCandidate(
  overrides?: Partial<ReviewCandidate> & { index?: number },
): ReviewCandidate {
  const index = overrides?.index ?? 0;
  return {
    questionId: overrides?.questionId ?? `rq-${index}`,
    validWrongCount: overrides?.validWrongCount ?? 0,
    version: {
      questionVersionId: overrides?.version?.questionVersionId ?? `rqv-${index}-v1`,
      versionNo: overrides?.version?.versionNo ?? 1,
      optionIds: overrides?.version?.optionIds ?? ['a', 'b', 'c', 'd'],
      answerOptionIds: overrides?.version?.answerOptionIds ?? ['b'],
    },
  };
}

/** 후보 목록 fixture — count개, 지정한 오답 횟수 맵을 적용한다. */
export function makeCandidates(count: number, wrongCounts: Readonly<Record<number, number>> = {}): ReviewCandidate[] {
  return Array.from({ length: count }, (_, i) => makeCandidate({ index: i, validWrongCount: wrongCounts[i] ?? 0 }));
}

/** 상태를 가진 가짜 소스 — 북마크 토글과 후보 증감을 시뮬레이션한다. */
export function fakeSource(input: {
  wrong?: readonly ReviewCandidate[];
  bookmarked?: readonly ReviewCandidate[];
}) {
  const state = {
    wrong: [...(input.wrong ?? [])],
    bookmarked: [...(input.bookmarked ?? [])],
  };
  const calls = { wrong: 0, bookmarked: 0, toggled: 0 };
  const source: ReviewSourcePort = {
    async listWrongCandidates() {
      calls.wrong += 1;
      return state.wrong;
    },
    async listBookmarkCandidates() {
      calls.bookmarked += 1;
      return state.bookmarked;
    },
    async toggleBookmark({ questionId }) {
      calls.toggled += 1;
      const index = state.bookmarked.findIndex((candidate) => candidate.questionId === questionId);
      if (index >= 0) {
        state.bookmarked.splice(index, 1);
        return { bookmarked: false };
      }
      state.bookmarked.push(makeCandidate({ questionId, validWrongCount: 2 }));
      return { bookmarked: true };
    },
    async setBookmark({ questionId, bookmarked }) {
      calls.toggled += 1;
      const index = state.bookmarked.findIndex((candidate) => candidate.questionId === questionId);
      if (bookmarked) {
        if (index < 0) state.bookmarked.push(makeCandidate({ questionId, validWrongCount: 2 }));
        return { bookmarked: true };
      }
      if (index >= 0) state.bookmarked.splice(index, 1);
      return { bookmarked: false };
    },
  };
  return { source, state, calls };
}

/** 가짜 회차 저장소 — 계정·시험·모드별 활성 1개를 메모리로 유지한다. */
export function fakeRepository() {
  const sessions = new Map<string, ReviewSession>();
  const endedByKey = new Map<string, ReviewSession>();
  const key = (userId: string, examId: string, mode: string) => `${userId}|${examId}|${mode}`;
  const repository: ReviewSessionRepository = {
    async findActive({ userId, examId, mode }) {
      const session = sessions.get(key(userId, examId, mode)) ?? null;
      return session !== null && session.status === 'active' ? session : null;
    },
    async findLastEnded({ userId, examId, mode }) {
      const k = key(userId, examId, mode);
      const byEnd = endedByKey.get(k) ?? null;
      if (byEnd !== null) return byEnd;
      const session = sessions.get(k) ?? null;
      return session !== null && session.status === 'ended' ? session : null;
    },
    async save({ session }) {
      const existing = sessions.get(key(session.userId, session.examId, session.mode));
      if (existing !== undefined && existing.id !== session.id && existing.status === 'active') {
        // 어댑터의 부분 UNIQUE 유사 — 활성 회차가 이미 있으면 새 회차 저장을 거부한다.
        throw new Error('review: active session already exists');
      }
      sessions.set(key(session.userId, session.examId, session.mode), session);
    },
    async end({ session, expectedCursor }) {
      const stored = sessions.get(key(session.userId, session.examId, session.mode));
      if (!stored || stored.id !== session.id || stored.status !== 'active' || session.status !== 'ended') return false;
      if (stored.cursor !== expectedCursor || session.cursor !== expectedCursor) return false;
      sessions.set(key(session.userId, session.examId, session.mode), session);
      endedByKey.set(key(session.userId, session.examId, session.mode), session);
      return true;
    },
  };
  return { repository, sessions };
}

/** 가짜 Clock/RNG — 고정 시각과 결정적 시드. */
export function fakeTimeRng(seed = 123, now = 1700000000): { clock: ReviewClock; rng: ReviewRng } {
  return { clock: { now: () => now }, rng: { next: seededRng(seed) } };
}

/**
 * 가짜 원자 채점 저장소 — CAS로 회차+attempt를 함께 저장한다(#54, 필수주입).
 * - stored 세션의 cursor가 expected와 다르면 false·쓰기 0건(경합은 1명만 true).
 * - firstAttempt는 SQL 규칙 모사: 같은 user/exam/question의 유효 correct/wrong 최초만 true, pass false.
 */
export function fakeGradingRepository(
  sessions: Map<string, ReviewSession>,
  seed: readonly ReviewGradingAttempt[] = [],
) {
  const attempts = new Map<string, ReviewGradingAttempt & { firstAttempt: boolean }>();
  const priorKeys = new Set<string>();
  for (const s of seed) {
    const key = `${s.userId}|${s.examId}|${s.questionId}`;
    if (s.outcome === 'correct' || s.outcome === 'wrong') priorKeys.add(key);
  }
  const calls = { commit: 0 };
  const keyOf = (userId: string, examId: string, mode: string) => `${userId}|${examId}|${mode}`;
  const repository: ReviewGradingRepository = {
    async commit({ session, expectedCursor, attempt }) {
      calls.commit += 1;
      const stored = sessions.get(keyOf(session.userId, session.examId, session.mode)) ?? null;
      if (stored === null || stored.id !== session.id) return false;
      if (stored.status !== 'active' || session.status !== 'active') return false;
      if (stored.cursor !== expectedCursor || session.cursor !== expectedCursor + 1) return false;
      if (expectedCursor < 0 || expectedCursor >= stored.items.length) return false;
      const storedItem = stored.items[expectedCursor];
      const nextItem = session.items[expectedCursor];
      if (!storedItem || !nextItem) return false;
      if (storedItem.questionId !== attempt.questionId || nextItem.questionId !== attempt.questionId) return false;
      if (storedItem.questionVersionId !== attempt.questionVersionId) return false;
      if (nextItem.state.kind !== 'graded') return false;
      if (session.userId !== attempt.userId || session.examId !== attempt.examId) return false;
      if (stored.userId !== attempt.userId || stored.examId !== attempt.examId) return false;
      const priorKey = `${attempt.userId}|${attempt.examId}|${attempt.questionId}`;
      const firstAttempt =
        (attempt.outcome === 'correct' || attempt.outcome === 'wrong') && !priorKeys.has(priorKey);
      if (firstAttempt) priorKeys.add(priorKey);
      sessions.set(keyOf(session.userId, session.examId, session.mode), session);
      attempts.set(attempt.attemptId, { ...attempt, firstAttempt });
      return true;
    },
  };
  return { repository, attempts, calls };
}
