import type { StudySet } from './types';
export { STUDY_SET_SIZE } from './thresholds';

/**
 * 학습 세트 불변식 (이슈 #49, ADR-0020/0081).
 * - 새 세트는 1~8문항(부족 시 가능한 만큼), 0문항·중복·빈 보기 순서는 거부.
 * - 기존 10/20문항 active 세트는 읽기/풀이/제출 경로에서 길이를 강제하지 않으므로 계속 동작한다(ADR-0046/0081).
 * - 세트 크기 검사는 생성 시에만 수행한다.
 */

export function isActive(set: StudySet): boolean {
  return set.status === 'active';
}

export function assertStudySetInvariants(set: StudySet): void {
  const size = set.items.length;
  const legacy = size === 10 || size === 20;
  if (size < 1 || (size > 8 && !legacy)) {
    throw new Error(`study: 세트는 1~8문제(기존 10/20 포함)여야 한다`);
  }
  const ids = new Set(set.items.map((item) => item.questionId));
  if (ids.size !== set.items.length) {
    throw new Error('study: 세트 내 동일 문제 중복 금지');
  }
  for (const item of set.items) {
    if (item.optionOrder.length === 0) throw new Error('study: 보기 순서 스냅샷이 비어 있다');
    if (new Set(item.optionOrder).size !== item.optionOrder.length) {
      throw new Error('study: 보기 순서에 중복이 있다');
    }
  }
}

/** 제출된 세트는 submittedAt이 있어야 하며, 이후 변경 함수는 이 가드를 통과해야 한다. */
export function assertItemsImmutableAfterSubmit(set: StudySet): void {
  if (set.status === 'submitted' && set.submittedAt === undefined) {
    throw new Error('study: 제출 세트에 submittedAt이 없다');
  }
}

/** 채점 가능한 상태는 active뿐이다(제출/포기 후 재채점 금지). */
export function assertGradable(set: StudySet): void {
  if (!isActive(set)) {
    throw new Error(`study: ${set.status} 세트는 채점할 수 없다`);
  }
}
