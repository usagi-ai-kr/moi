import { WEAK_WEIGHT_BASE, WRONG_COUNT_WEIGHT_STEP } from './thresholds';

/**
 * 선택 알고리즘 (이슈 #49, ADR-0020):
 * - 가중 무작위 추출(RNG 주입, 복원 없음 → 세트 내 중복 0).
 * - 전체 범위: 풀 엔트리의 공식 영역 비중(domainWeight)을 확률 가중으로 사용.
 * - 영역 모드: 선택 영역 안에서만(호출자가 필터링), 영역 안 균등.
 * - 취약 영역 모드: 아직 풀지 않은 문제를 우선 채우고, 소진하면 전체 풀에서
 *   유효 누적 오답 횟수 가중 확률로 추출한다(항상 맞힌 문제도 기본 가중치로 선택 가능).
 * - 시작 시 보기 순서를 Fisher–Yates로 섞어 스냅샷 고정한다(다른 회차는 새 순서).
 */

export { WEAK_WEIGHT_BASE } from './thresholds';

export interface WeightedEntry<T> {
  readonly weight: number;
  readonly value: T;
}

/** 가중치 기반 비복원 추출 — 요청 크기를 넘으면 풀 전체를 반환(경계). 전 가중치 0은 마지막부터 결정적. */
export function weightedSample<T>(
  entries: readonly WeightedEntry<T>[],
  size: number,
  rng: () => number,
): WeightedEntry<T>[] {
  const pool = [...entries];
  const picked: WeightedEntry<T>[] = [];
  while (picked.length < size && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    let roll = rng() * total;
    let index = pool.length - 1;
    if (total > 0) {
      for (let i = 0; i < pool.length; i += 1) {
        roll -= Math.max(0, pool[i].weight);
        if (roll < 0) {
          index = i;
          break;
        }
      }
    }
    picked.push(pool[index] as WeightedEntry<T>);
    pool.splice(index, 1);
  }
  return picked;
}

/** 아직 풀지 않은 문제만 후보로 남긴다(미풀이 우선). */
export function unattemptedFirst<T extends { questionId: string; attempted: boolean }>(
  entries: readonly T[],
  attemptedQuestionIds: readonly string[],
): readonly T[] {
  const attempted = new Set(attemptedQuestionIds);
  return entries.filter((entry) => !entry.attempted && !attempted.has(entry.questionId));
}

/** 취약 영역 후보: 1 + 유효 누적 오답 횟수 가중(전체 풀 대상 — 미풀이 소진 시 사용). */
export function weakCandidates<T extends { wrongCount: number }>(
  entries: readonly T[],
  _attemptedQuestionIds: readonly string[] = [],
): WeightedEntry<T>[] {
  void _attemptedQuestionIds;
  return entries.map((entry) => ({
    weight: WEAK_WEIGHT_BASE + Math.max(0, entry.wrongCount) * WRONG_COUNT_WEIGHT_STEP,
    value: entry,
  }));
}

/** Fisher–Yates 셔플 — 시작 시 보기 순서 스냅샷 생성. 결정적(같은 시드 같은 결과). */
export function shuffleOptionOrder(optionIds: readonly string[], rng: () => number): string[] {
  const order = [...optionIds];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i] as string;
    order[i] = order[j] as string;
    order[j] = tmp;
  }
  return order;
}
