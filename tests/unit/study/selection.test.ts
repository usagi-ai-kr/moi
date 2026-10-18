import { describe, expect, it } from 'vitest';
import { shuffleOptionOrder, unattemptedFirst, weakCandidates, weightedSample, WEAK_WEIGHT_BASE, type WeightedEntry } from '@/domain/study/selection';
import { makePoolEntry, scriptedRng, seededRng, DOMAIN_CODES } from './fixtures';

// 이슈 #49 규칙 — 가중 무작위 선택(공식 영역 비중·오답 가중)·보기 순서 셔플·세트 내 중복 0.

describe('weightedSample (가중 무작위, 복원 없음)', () => {
  it('스크립트된 roll이 가중치 수학을 따른다: roll=0 → 누적 첫 항목', () => {
    const entries: WeightedEntry<{ id: string }>[] = [
      { weight: 150, value: { id: 'heavy' } },
      { weight: 100, value: { id: 'light' } },
    ];
    const picked = weightedSample(entries, 1, scriptedRng([0]));
    expect(picked[0]?.value.id).toBe('heavy');
  });

  it('roll이 임계를 넘으면 두 번째 항목: total 250에서 roll 200 이상', () => {
    const entries: WeightedEntry<{ id: string }>[] = [
      { weight: 150, value: { id: 'heavy' } },
      { weight: 100, value: { id: 'light' } },
    ];
    // total=250, roll = rng()*250 — rng 0.9 → 225 → 첫 항목(150) 소진 → light
    const picked = weightedSample(entries, 1, scriptedRng([0.9]));
    expect(picked[0]?.value.id).toBe('light');
  });

  it('공식 영역 비중(150/130/120/100) 가중: 고정 시드 반복에서 비중이 무작위 균등과 다르다', () => {
    const entries = DOMAIN_CODES.flatMap((domainId, di) =>
      Array.from({ length: 2 }, (_, i) => ({
        weight: [150, 130, 120, 100][di] as number,
        value: makePoolEntry({ questionId: `${domainId}-${i}`, domainId }),
      })),
    );
    const rng = seededRng(20261018);
    const domainPicks = new Map<string, number>();
    for (let run = 0; run < 500; run += 1) {
      const [picked] = weightedSample(entries, 1, rng);
      const domainId = picked?.value.domainId ?? '';
      domainPicks.set(domainId, (domainPicks.get(domainId) ?? 0) + 1);
    }
    const security = domainPicks.get(DOMAIN_CODES[0]) ?? 0;
    const cost = domainPicks.get(DOMAIN_CODES[3]) ?? 0;
    // 기대 비중 security 150/500=30% vs cost 100/500=20% — 보안이 비용보다 자주 뽑혀야 한다
    expect(security).toBeGreaterThan(cost);
    expect(security / 500).toBeGreaterThan(0.24);
    expect(security / 500).toBeLessThan(0.36);
  });

  it('세트 내 중복 0: 40개 풀에서 20개를 모두 다른 문제로 뽑는다', () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({
      weight: 150,
      value: makePoolEntry({ questionId: `q-${i}`, index: i }),
    }));
    const picked = weightedSample(entries, 20, seededRng(7));
    expect(picked).toHaveLength(20);
    expect(new Set(picked.map((entry) => entry.value.questionId)).size).toBe(20);
  });

  it('풀이 소진(미풀이 없음) 시에도 요청 개수만큼 뽑되 풀 크기를 넘지 않는다(경계)', () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({ weight: 1, value: makePoolEntry({ index: i }) }));
    const picked = weightedSample(entries, 20, seededRng(1));
    expect(picked).toHaveLength(3);
  });
});

describe('weak 모드 가중치 (미풀이 우선·유효 누적 오답 가중)', () => {
  it('미풀이 우선: 후보는 미풀이만으로 구성한다', () => {
    const attempted = ['q-a1', 'q-a2'];
    const pool = [
      makePoolEntry({ questionId: 'q-a1', attempted: true, wrongCount: 5 }),
      makePoolEntry({ questionId: 'q-b1', attempted: false }),
      makePoolEntry({ questionId: 'q-a2', attempted: true, wrongCount: 2 }),
      makePoolEntry({ questionId: 'q-b2', attempted: false }),
    ];
    const candidates = unattemptedFirst(pool, attempted);
    expect(candidates.map((entry) => entry.questionId)).toEqual(['q-b1', 'q-b2']);
  });

  it('소진 시: 오답 가중(1+wrongCount)으로 전체 풀에서 뽑는다 — 0오답 문제도 선택 가능', () => {
    const attempted = ['q-x'];
    const pool = [
      makePoolEntry({ questionId: 'q-wrong3', attempted: true, wrongCount: 3 }),
      makePoolEntry({ questionId: 'q-wrong1', attempted: true, wrongCount: 1 }),
      makePoolEntry({ questionId: 'q-correct0', attempted: true, wrongCount: 0 }),
    ];
    const candidates = weakCandidates(pool, attempted);
    expect(candidates.map((entry) => entry.weight)).toEqual([4, 2, 1]); // 1+wrongCount
    const rng = seededRng(42);
    const counts = new Map<string, number>();
    for (let run = 0; run < 700; run += 1) {
      const [picked] = weightedSample(candidates, 1, rng);
      const id = picked?.value.questionId ?? '';
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // wrong3(가중4/7≈57%) > wrong1(2/7≈29%) > correct0(1/7≈14%)
    const wrong3 = counts.get('q-wrong3') ?? 0;
    const correct0 = counts.get('q-correct0') ?? 0;
    expect(wrong3).toBeGreaterThan(correct0 * 2);
    expect(correct0).toBeGreaterThan(0); // 항상 맞힌 문제도 선택된다(ADR-0020)
    expect(WEAK_WEIGHT_BASE).toBe(1);
  });
});

describe('shuffleOptionOrder (시작 시 보기 순서 스냅샷)', () => {  const optionIds = ['a', 'b', 'c', 'd'];

  it('고정 시드 셔플은 결정적이고 같은 시드엔 같은 순서(새로고침·이어풀기 유지)', () => {
    expect(shuffleOptionOrder(optionIds, seededRng(99))).toEqual(shuffleOptionOrder(optionIds, seededRng(99)));
  });

  it('다른 시드(다른 회차)엔 다른 순서가 나올 수 있다', () => {
    const orders = Array.from({ length: 20 }, (_, i) => JSON.stringify(shuffleOptionOrder(optionIds, seededRng(i))));
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it('순서는 원소의 순열이다', () => {
    const shuffled = shuffleOptionOrder(optionIds, seededRng(3));
    expect([...shuffled].sort()).toEqual([...optionIds].sort());
  });
});
