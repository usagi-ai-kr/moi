import { describe, expect, it } from 'vitest';
import { planReviewRound, rejoinPending, remainingAfterPick } from '@/domain/review/round-queue';

// ADR-0059 queue plan 단위 — 25→10→10→5→새 cycle, legacy, append/remove, early end 재입대.
function ids(n: number, prefix = 'q'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

describe('planReviewRound (ADR-0059)', () => {
  it('초기 plan은 현재 전체를 remaining/cycle로 쓴다', () => {
    const current = ids(25);
    const plan = planReviewRound({ currentIds: current, lastEnded: null });
    expect(plan.remaining).toEqual(current);
    expect(plan.cycle).toEqual(current);
  });

  it('remaining 소진 시 현재 전체로 새 cycle을 연다', () => {
    const current = ids(25);
    const plan = planReviewRound({
      currentIds: current,
      lastEnded: { itemIds: ids(10, 'old'), remaining: [], cycle: ids(10, 'old') },
    });
    expect(plan.remaining).toEqual(current);
    expect(plan.cycle).toEqual(current);
  });

  it('legacy ended는 현재-직전 items를 remaining으로 쓴다', () => {
    const current = ids(5);
    const plan = planReviewRound({
      currentIds: current,
      lastEnded: { itemIds: ['q-0', 'q-1'], remaining: null, cycle: null },
    });
    expect(plan.remaining).toEqual(['q-2', 'q-3', 'q-4']);
    expect(plan.cycle).toEqual(current);
  });

  it('legacy 모두 소비 시 새 cycle 전체로 채운다', () => {
    const current = ['q-0', 'q-1'];
    const plan = planReviewRound({
      currentIds: current,
      lastEnded: { itemIds: ['q-0', 'q-1'], remaining: null, cycle: null },
    });
    expect(plan.remaining).toEqual(current);
  });

  it('신규는 append하고 사라진 후보는 제거한다', () => {
    const plan = planReviewRound({
      currentIds: ['q-0', 'q-2', 'q-new'],
      lastEnded: { itemIds: ['q-0', 'q-1', 'q-2'], remaining: ['q-0', 'q-1', 'q-2'], cycle: ['q-0', 'q-1', 'q-2'] },
    });
    expect(plan.cycle).toEqual(['q-0', 'q-2', 'q-new']);
    expect(plan.remaining).toEqual(['q-0', 'q-2', 'q-new']);
  });
});

describe('remainingAfterPick·rejoinPending', () => {
  it('선택분을 제외하고 순서를 유지한다', () => {
    expect(remainingAfterPick(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
  });

  it('pending을 중복 없이 뒤에 복귀시킨다', () => {
    expect(rejoinPending(['a'], ['b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });
});
