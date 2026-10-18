import type { StudySet } from './types';
import { STUDY_SET_SIZE } from './thresholds';

/**
 * 학습 세트 불변식 (이슈 #49, ADR-0020).
 * - 20문제·문제 중복 0·활성 세트 1개(저장소/유스케이스 책임)·제출 후 변경/재채점 금지·포기 후 채점 금지.
 */

export { STUDY_SET_SIZE } from './thresholds';

export function isActive(set: StudySet): boolean {
  return set.status === 'active';
}

export function assertStudySetInvariants(set: StudySet): void {
  if (set.items.length !== STUDY_SET_SIZE) {
    throw new Error(`study: 세트는 ${STUDY_SET_SIZE}문제여야 한다`);
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
