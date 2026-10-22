import type { QuestionDraft, QuestionFinding } from '../types';

/**
 * 규칙 1·2 — 문제 단위 구조 검사 (이슈 #48, ADR-0019).
 * 규칙 1: 필수 필드·비어 있지 않은 stem/options/answers/explanation/sourceUrls.
 * 규칙 2: answerOptionIds가 option id 부분집합이고 1개 이상(단일·복수).
 */

export function checkRequiredFields(draft: QuestionDraft): QuestionFinding[] {
  const findings: QuestionFinding[] = [];
  const add = (reason: string) => findings.push({ questionId: draft.id, checkId: 'required-fields', reason });

  if (draft.exam !== 'AWS-SAA-C03') add('required-fields: 지원하지 않는 시험 id다');
  if (typeof draft.stem !== 'string' || draft.stem.trim().length === 0) add('required-fields: stem이 비어 있다');
  if (typeof draft.explanation !== 'string' || draft.explanation.trim().length === 0) {
    add('required-fields: explanation이 비어 있다');
  }
  if (draft.sourceUrls.length === 0) add('required-fields: sourceUrls가 비어 있다');
  if (draft.options.length < 2) add('required-fields: options가 2개 미만이다');

  const seenIds = new Set<string>();
  for (const option of draft.options) {
    if (option.id.trim().length === 0) add('required-fields: option id가 비어 있다');
    if (seenIds.has(option.id)) add(`required-fields: option id 중복(${option.id})`);
    seenIds.add(option.id);
    if (option.text.trim().length === 0) add(`required-fields: option 텍스트가 비어 있다(${option.id})`);
  }

  return findings;
}

export function checkAnswerConsistency(draft: QuestionDraft): QuestionFinding[] {
  const findings: QuestionFinding[] = [];
  const add = (reason: string) => findings.push({ questionId: draft.id, checkId: 'answer-consistency', reason });

  if (draft.answerOptionIds.length === 0) {
    add('answer-consistency: 정답이 1개 이상이어야 한다');
    return findings;
  }
  const optionIds = new Set(draft.options.map((option) => option.id));
  const unknown = draft.answerOptionIds.filter((id) => !optionIds.has(id));
  if (unknown.length > 0) {
    add('answer-consistency: answerOptionIds가 option id 부분집합이 아니다');
  }
  const answerIds = new Set(draft.answerOptionIds);
  if (answerIds.size !== draft.answerOptionIds.length) {
    add('answer-consistency: answerOptionIds에 중복이 있다');
  }
  return findings;
}
