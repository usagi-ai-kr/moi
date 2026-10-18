import type { PoolEntry } from '@/app/study/ports';

/**
 * 결정적 RNG·Pool fixture (이슈 #49) — 실제 AI/DB/네트워크 미사용.
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

/** 스크립트된 값을 순서대로 반환하는 RNG — 가중 수학 검증용. */
export function scriptedRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

export const DOMAIN_CODES = ['dom-security', 'dom-resilience', 'dom-performance', 'dom-cost'] as const;

/** 공식 영역 비중(150/130/120/100)을 domainWeight로 반영한 풀 엔트리를 만든다. */
export function makePoolEntry(
  overrides?: Partial<Omit<PoolEntry, 'version'>> & {
    index?: number;
    domainIndex?: number;
    version?: Partial<PoolEntry['version']>;
  },
): PoolEntry {
  const domainIndex = overrides?.domainIndex ?? 0;
  const domainId = overrides?.domainId ?? DOMAIN_CODES[domainIndex] ?? 'dom-security';
  const domainWeight = overrides?.domainWeight ?? [150, 130, 120, 100][domainIndex] ?? 150;
  const index = overrides?.index ?? 0;
  const optionIds = overrides?.version?.optionIds ?? ['a', 'b', 'c', 'd'];
  return {
    questionId: overrides?.questionId ?? `q-${index}`,
    domainId,
    domainWeight,
    attempted: overrides?.attempted ?? false,
    wrongCount: overrides?.wrongCount ?? 0,
    version: {
      questionVersionId: overrides?.version?.questionVersionId ?? `qv-${index}-v1`,
      versionNo: overrides?.version?.versionNo ?? 1,
      optionIds,
      answerOptionIds: overrides?.version?.answerOptionIds ?? ['b'],
      stem: overrides?.version?.stem ?? `문제 ${index} 본문`,
      options:
        overrides?.version?.options ?? optionIds.map((id) => ({ optionId: id, text: `보기 ${id} 내용` })),
      explanation: overrides?.version?.explanation ?? `문제 ${index} 해설`,
      sourceUrls: overrides?.version?.sourceUrls ?? [`https://docs.aws.amazon.com/q-${index}`],
    },
  };
}
