import { describe, expect, it } from 'vitest';
import { pickOrder, shuffle, toWeighted, wrongWeight } from '@/domain/review/selection';
import { REVIEW_WEIGHT_BASE } from '@/domain/review/thresholds';
import { makeCandidate, makeCandidates, scriptedRng, seededRng } from './fixtures';

// 이슈 #51 선택 알고리즘 — wrong 가중/ bookmark 균등, 비복원(회차 내 중복 0).

describe('wrongWeight (1 + 유효 누적 오답)', () => {
  it('오답 0이면 기본 가중치 — 항상 맞힌 문제도 후보가 된다', () => {
    expect(wrongWeight(makeCandidate({ validWrongCount: 0 }))).toBe(REVIEW_WEIGHT_BASE);
  });

  it('오답 3이면 4 — 선형 가중(1+wrongCount)', () => {
    expect(wrongWeight(makeCandidate({ validWrongCount: 3 }))).toBe(4);
  });

  it('음수 오답은 0으로 클램프한다', () => {
    expect(wrongWeight(makeCandidate({ validWrongCount: -2 }))).toBe(REVIEW_WEIGHT_BASE);
  });
});

describe('toWeighted (모드별 가중치)', () => {
  it('bookmark는 전부 동일 가중치(균등 무작위)', () => {
    const weighted = toWeighted(makeCandidates(3, { 0: 5, 1: 3, 2: 1 }), 'bookmark');
    expect(weighted.map((entry) => entry.weight)).toEqual([1, 1, 1]);
  });

  it('wrong은 오답 횟수별로 다르다', () => {
    const weighted = toWeighted(makeCandidates(3, { 0: 5, 1: 3, 2: 0 }), 'wrong');
    expect(weighted.map((entry) => entry.weight)).toEqual([6, 4, 1]);
  });
});

describe('pickOrder (회차 순서·중복 0)', () => {
  it('wrong 복습: 오답 3·Pass 1·미응답 1 → 5문제 전원이 대상이 되고 가중치가 적용된다', () => {
    // Pass·미응출 제출도 유효 오답으로 계수된다고 가정한 소스(오답 3, Pass 1, 미응답 1 → 각 1점 이상).
    const candidates = makeCandidates(5, { 0: 3, 1: 1, 2: 1, 3: 1, 4: 1 });
    const order = pickOrder(candidates, 'wrong', seededRng(7));
    expect(order).toHaveLength(5);
    expect(new Set(order.map((c) => c.questionId)).size).toBe(5);
  });

  it('가중치가 높은 후보가 더 자주 첫 번째로 뽑힌다(가중 적용)', () => {
    const heavy = makeCandidate({ questionId: 'heavy', validWrongCount: 20 });
    const lights = makeCandidates(3).map((c) => ({ ...c, validWrongCount: 0 }));
    const candidates = [heavy, ...lights];
    const rng = seededRng(42);
    let heavyFirst = 0;
    for (let i = 0; i < 300; i += 1) {
      const order = pickOrder(candidates, 'wrong', rng);
      if (order[0]?.questionId === 'heavy') heavyFirst += 1;
    }
    // 가중 21 vs 1·1·1 → 기대 확률 약 0.75. 균등(0.25)과 명확히 구분되는 하한.
    expect(heavyFirst / 300).toBeGreaterThan(0.55);
  });

  it('bookmark 복습: 후보 전체가 균등 — 오답 횟수와 무관하게 순서만 정해진다', () => {
    const candidates = makeCandidates(5, { 0: 9, 1: 1, 2: 0, 3: 0, 4: 0 });
    const rng = seededRng(9);
    const firstCounts: Record<string, number> = {};
    for (let i = 0; i < 300; i += 1) {
      const first = pickOrder(candidates, 'bookmark', rng)[0];
      if (first) firstCounts[first.questionId] = (firstCounts[first.questionId] ?? 0) + 1;
    }
    // 균등이면 각 후보가 약 60회(0.2). 오답 9점 후보가 압도하지 않음을 확인.
    for (const count of Object.values(firstCounts)) {
      expect(count).toBeGreaterThan(20);
      expect(count).toBeLessThan(110);
    }
  });

  it('비복원 추출 — 회차 내 중복 0', () => {
    const candidates = makeCandidates(6, { 0: 2, 3: 5 });
    const order = pickOrder(candidates, 'wrong', seededRng(3));
    expect(new Set(order.map((c) => c.questionId)).size).toBe(6);
  });

  it('스크립트 RNG로 가중 수학 검증 — 큰 가중치 후보가 먼저 선택된다', () => {
    const candidates = makeCandidates(2, { 0: 3, 1: 0 }); // 가중 4 vs 1, total 5
    const order = pickOrder(candidates, 'wrong', scriptedRng([0.05]));
    expect(order[0]?.questionId).toBe('rq-0');
    const uniform = pickOrder(candidates, 'bookmark', scriptedRng([0.6]));
    expect(uniform[0]?.questionId).toBe('rq-1'); // 균등 total 2, roll 1.2 → rq-1
  });

  it('빈 후보는 빈 회차 — 경계(대상 0)', () => {
    expect(pickOrder([], 'wrong', seededRng(1))).toEqual([]);
  });
});

describe('shuffle (보기 순서 스냅샷)', () => {
  it('같은 시드면 같은 순서(결정적), 원 배열은 변경하지 않는다', () => {
    const options = ['a', 'b', 'c', 'd'];
    const first = shuffle(options, seededRng(5));
    const second = shuffle(options, seededRng(5));
    expect(first).toEqual(second);
    expect(options).toEqual(['a', 'b', 'c', 'd']);
    expect([...first].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('1개 보기 — 자기 자신(경계)', () => {
    expect(shuffle(['only'], seededRng(1))).toEqual(['only']);
  });
});
