import type { ReviewCandidate } from './types';

/**
 * 10문항 회차 큐(ADR-0059) — 순수 함수, D1/HTTP 모름.
 * - plan: 현재 후보와 직전 ended queue를 병합해 이번 plan의 remaining/cycle을 정한다.
 * - remainingAfter: plan remaining에서 이번 회차 선택분을 뺀다.
 * - rejoin: ended의 pending을 remaining에 복귀시킨다(채점분은 소비).
 */

export interface EndedQueue {
  readonly itemIds: readonly string[];
  readonly remaining: readonly string[] | null;
  readonly cycle: readonly string[] | null;
}

export function planReviewRound(input: {
  readonly currentIds: readonly string[];
  readonly lastEnded: EndedQueue | null;
}): { readonly remaining: string[]; readonly cycle: string[] } {
  const current = [...new Set(input.currentIds)];
  if (input.lastEnded === null) return { remaining: [...current], cycle: [...current] };
  const { itemIds, remaining, cycle } = input.lastEnded;
  if (remaining === null || cycle === null) {
    const consumed = new Set(itemIds);
    const rest = current.filter((id) => !consumed.has(id));
    if (rest.length === 0) return { remaining: [...current], cycle: [...current] };
    return { remaining: rest, cycle: [...current] };
  }
  const currentSet = new Set(current);
  const prevCycleSet = new Set(cycle);
  const keptCycle = cycle.filter((id) => currentSet.has(id));
  const keptRemaining = remaining.filter((id) => currentSet.has(id));
  // 이전 순환이 소진됐으면(keptRemaining 비움) 현재 전체로 새 순환을 연다(신규 포함).
  if (keptRemaining.length === 0) return { remaining: [...current], cycle: [...current] };
  const appended = current.filter((id) => !prevCycleSet.has(id));
  const nextCycle = [...keptCycle, ...appended];
  const nextRemaining = [...keptRemaining, ...appended];
  if (nextRemaining.length === 0) return { remaining: [...current], cycle: [...current] };
  return { remaining: nextRemaining, cycle: nextCycle };
}

/** plan remaining에서 이번 회차 선택분을 제외한다(순서 유지). */
export function remainingAfterPick(
  remaining: readonly string[],
  pickedIds: readonly string[],
): string[] {
  const picked = new Set(pickedIds);
  return remaining.filter((id) => !picked.has(id));
}

/** ended pending을 remaining에 복귀시킨다(중복 없이 뒤에 append). */
export function rejoinPending(
  remaining: readonly string[],
  pendingIds: readonly string[],
): string[] {
  const seen = new Set(remaining);
  const out = [...remaining];
  for (const id of pendingIds) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** 후보 객체에서 ID 목록을 뽑는다(중복 제거·순서 유지). */
export function candidateIds(candidates: readonly ReviewCandidate[]): string[] {
  return [...new Set(candidates.map((c) => c.questionId))];
}
