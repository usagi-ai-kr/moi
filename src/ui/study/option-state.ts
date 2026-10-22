import type { ItemResponse, StudyActiveItem } from '../api/client';
import { isSingleChoice, nextSelectedIds } from '../components/option-select';

// 학습 보기 상태 계산(#308) — QuestionView 가 화면 크기에 신경 쓰지 않도록 분리한다.
// 단일 선택(정답 1개)=radio 교체 semantics, 복수 선택=checkbox 토글 누적을 유지한다.

/** 해당 보기가 선택되어 있는지. */
export function isChecked(item: StudyActiveItem, optionId: string): boolean {
  return item.response.kind === 'answered' && item.response.optionIds.includes(optionId);
}

/**
 * 보기 input 유형 — 단일 선택(정답 1개)은 radio 그룹, 복수는 checkbox.
 * 예전 UI가 저장한 단일 문항 복수 답안은 무단 정정하지 않는다: checkbox 호환 렌더로 그대로 보고,
 * 다음 선택이 교체 semantics로 반영되면 1개로 정정된다.
 */
export function optionRowType(item: StudyActiveItem): { type: 'checkbox' | 'radio'; radioName?: string } {
  const legacyMulti = item.response.kind === 'answered' && item.response.optionIds.length > 1;
  if (!legacyMulti && isSingleChoice(item.answerCount)) {
    return { type: 'radio', radioName: `study-${item.questionVersionId}` };
  }
  return { type: 'checkbox' };
}

/** 보기 클릭 응답 — 단일은 교체(정확히 1개), 복수는 토글 누적(기존 기능 유지). */
export function answeredAfterSelect(item: StudyActiveItem, optionId: string): ItemResponse {
  const current = item.response.kind === 'answered' ? item.response.optionIds : [];
  const next = nextSelectedIds(item.answerCount, current, optionId);
  return next.length === 0 ? { kind: 'unanswered' } : { kind: 'answered', optionIds: next };
}

/** 보기 텍스트 — 스냅샷에 없으면 id 로 대체한다. */
export function optionText(item: StudyActiveItem, optionId: string): string {
  return item.options.find((o) => o.optionId === optionId)?.text ?? optionId;
}

/** 진행 표시용 응답 요약. */
export function responseLabel(r: ItemResponse): string {
  if (r.kind === 'answered') return `선택 ${r.optionIds.length}`;
  if (r.kind === 'pass') return 'Pass';
  return '미응답';
}
