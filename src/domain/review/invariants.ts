import type { ReviewSession } from './types';

/**
 * 복습 회차 불변식 (이슈 #51, ADR-0020).
 * - 회차 내 동일 문제 중복 0, 커서 앞은 모두 채점(즉시 채점·순서 고정), 커서 뒤는 미채점.
 * - 종료 후 변경/재채점 금지(active가 아니면 채점 불가).
 * - 다른 사용자/시험 세션 접근 금지 — 소유권 검증은 이 가드로 한다.
 * - 시작 시 대상·순서 스냅샷 고정(회차 중 증감은 다음 회차부터).
 */

export function assertReviewSessionInvariants(session: ReviewSession): void {
  if (session.items.length === 0) {
    throw new Error('review: 회차는 최소 1문제 이상이어야 한다');
  }
  const ids = new Set(session.items.map((item) => item.questionId));
  if (ids.size !== session.items.length) {
    throw new Error('review: 회차 내 동일 문제 중복 금지');
  }
  if (session.cursor < 0 || session.cursor > session.items.length) {
    throw new Error('review: 커서가 회차 범위를 벗어났다');
  }
  // 순서 고정 + 즉시 채점: 커서 앞은 모두 채점, 커서부터 끝까지 미채점이어야 한다.
  session.items.forEach((item, index) => {
    if (item.optionOrder.length === 0) throw new Error('review: 보기 순서 스냅샷이 비어 있다');
    if (new Set(item.optionOrder).size !== item.optionOrder.length) {
      throw new Error('review: 보기 순서에 중복이 있다');
    }
    if (item.answerOptionIds.length === 0) throw new Error('review: 정답 스냅샷이 비어 있다');
    const graded = index < session.cursor;
    if (graded !== (item.state.kind === 'graded')) {
      throw new Error('review: 채점 진행 상태가 커서와 불일치한다');
    }
  });
  if (session.status === 'active' && session.endedAt !== undefined) {
    throw new Error('review: 진행 중 회차에 종료 시각이 있다');
  }
  if (session.status === 'ended' && session.endedAt === undefined) {
    throw new Error('review: 종료된 회차에 종료 시각이 없다');
  }
}

/** 소유권 검증 — 다른 사용자/시험 세션 접근 금지(불변식). */
export function assertSessionOwned(
  session: ReviewSession,
  input: { readonly userId: string; readonly examId: string },
): boolean {
  return session.userId === input.userId && session.examId === input.examId;
}

export function isEnded(session: ReviewSession): boolean {
  return session.status === 'ended';
}
