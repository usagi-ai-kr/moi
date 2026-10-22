import { REVIEW_WEIGHT_BASE, REVIEW_WEIGHT_STEP } from './thresholds';
import type { ReviewCandidate, ReviewMode } from './types';

/**
 * 복습 대상 선택 (이슈 #51, ADR-0020/ADR-0059):
 * - `wrong`: 유효 누적 오답 횟수 가중치 비복원 추출(1+validWrongCount) — 오답 0(항상 맞힌)도 후보.
 * - `bookmark`: 균등 무작위 비복원 추출 — 가중치 없음.
 * - 회차는 plan된 remaining에서 최대 10문항(REVIEW_ROUND_SIZE)만 뽑으며 추출 순서가 곧 회차 순서다.
 * - 추출에 복원이 없으므로 회차 내 중복은 0이다. RNG는 주입받아 결정적 테스트가 가능하다.
 */

export interface WeightedCandidate {
  readonly weight: number;
  readonly value: ReviewCandidate;
}

/** wrong 복습 가중치 — 1 + 유효 누적 오답 횟수(음수는 0으로 클램프). */
export function wrongWeight(candidate: ReviewCandidate): number {
  return REVIEW_WEIGHT_BASE + Math.max(0, candidate.validWrongCount) * REVIEW_WEIGHT_STEP;
}

/** 후보 목록에 모드별 가중치를 붙인다 — bookmark는 전부 동일 가중치(균등). */
export function toWeighted(
  candidates: readonly ReviewCandidate[],
  mode: ReviewMode,
): WeightedCandidate[] {
  if (mode === 'bookmark') return candidates.map((value) => ({ weight: REVIEW_WEIGHT_BASE, value }));
  return candidates.map((value) => ({ weight: wrongWeight(value), value }));
}

/** 가중치 기반 비복원 추출 — 요청 크기를 넘으면 풀 전체 반환(경계). 전 가중치 0은 마지막부터 결정적. */
export function weightedSample<T>(
  entries: readonly WeightedCandidate[] | readonly { readonly weight: number; readonly value: T }[],
  size: number,
  rng: () => number,
): T[] {
  const pool = entries.map((entry) => ({ weight: entry.weight, value: entry.value as T }));
  const picked: T[] = [];
  while (picked.length < size && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    let roll = rng() * total;
    let index = pool.length - 1;
    if (total > 0) {
      for (let i = 0; i < pool.length; i += 1) {
        roll -= Math.max(0, pool[i]?.weight ?? 0);
        if (roll < 0) {
          index = i;
          break;
        }
      }
    }
    const chosen = pool[index];
    if (chosen === undefined) break;
    picked.push(chosen.value);
    pool.splice(index, 1);
  }
  return picked;
}

/** 모드별 추출 순서 — wrong는 가중, bookmark는 균등. 후보 전체를 순서만 정해 추출한다. */
export function pickOrder(
  candidates: readonly ReviewCandidate[],
  mode: ReviewMode,
  rng: () => number,
): ReviewCandidate[] {
  if (candidates.length === 0) return [];
  return weightedSample(toWeighted(candidates, mode), candidates.length, rng);
}

/** Fisher–Yates 셔플 — 시작 시 보기 순서 스냅샷 생성. 결정적(같은 시드 같은 결과). */
export function shuffle<T>(values: readonly T[], rng: () => number): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
