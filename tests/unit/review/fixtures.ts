import type { ReviewCandidate, ReviewSession } from '@/domain/review/types';
import type {
  ReviewClock,
  ReviewRng,
  ReviewSessionRepository,
  ReviewSourcePort,
} from '@/app/review/ports';

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
  };
  return { source, state, calls };
}

/** 가짜 회차 저장소 — 계정·시험·모드별 활성 1개를 메모리로 유지한다. */
export function fakeRepository() {
  const sessions = new Map<string, ReviewSession>();
  const key = (userId: string, examId: string, mode: string) => `${userId}|${examId}|${mode}`;
  const repository: ReviewSessionRepository = {
    async findActive({ userId, examId, mode }) {
      const session = sessions.get(key(userId, examId, mode)) ?? null;
      return session !== null && session.status === 'active' ? session : null;
    },
    async save({ session }) {
      const existing = sessions.get(key(session.userId, session.examId, session.mode));
      if (existing !== undefined && existing.id !== session.id && existing.status === 'active') {
        // 어댑터의 부분 UNIQUE 유사 — 활성 회차가 이미 있으면 새 회차 저장을 거부한다.
        throw new Error('review: active session already exists');
      }
      sessions.set(key(session.userId, session.examId, session.mode), session);
    },
  };
  return { repository, sessions };
}

/** 가짜 Clock/RNG — 고정 시각과 결정적 시드. */
export function fakeTimeRng(seed = 123, now = 1700000000): { clock: ReviewClock; rng: ReviewRng } {
  return { clock: { now: () => now }, rng: { next: seededRng(seed) } };
}
