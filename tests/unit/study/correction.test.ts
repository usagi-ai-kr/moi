import { describe, expect, it } from 'vitest';
import { gradeItems } from '@/domain/study/grading';
import { recomputeCorrectedResult } from '@/domain/study/correction';
import type { ItemResponse, StudySet, StudySetItem } from '@/domain/study/types';

// 이슈 #53 규칙 — 완료 세트 정정 재계산: 최초 답안/채점 보존 + 제외 문항을 걸러 유효 분모로 재계산.

type Outcome = 'correct' | 'wrong' | 'pass' | 'unanswered';

const OPTION_IDS = ['a', 'b', 'c', 'd'];
const ANSWER = ['b'];

function responseOf(outcome: Outcome): ItemResponse {
  if (outcome === 'correct') return { kind: 'answered', optionIds: ANSWER };
  if (outcome === 'wrong') return { kind: 'answered', optionIds: ['a'] };
  if (outcome === 'pass') return { kind: 'pass' };
  return { kind: 'unanswered' };
}

function versionIdOf(index: number): string {
  return `qv-${index}-v1`;
}

/** 제출 완료 세트 — 최초 채점은 실제 gradeItems로 생성한다(원본 이력 보존 전제). */
function makeSubmittedSet(outcomes: readonly Outcome[]): StudySet {
  const items: StudySetItem[] = outcomes.map((outcome, index) => ({
    questionId: `q-${index}`,
    questionVersionId: versionIdOf(index),
    versionNo: 1,
    optionOrder: OPTION_IDS,
    answerOptionIds: ANSWER,
    stem: `문제 ${index} 본문`,
    options: OPTION_IDS.map((id) => ({ optionId: id, text: `보기 ${id}` })),
    explanation: `문제 ${index} 해설`,
    sourceUrls: [],
    response: responseOf(outcome),
  }));
  const result = gradeItems(
    items,
    items.map((item) => ({ questionVersionId: item.questionVersionId, answerOptionIds: item.answerOptionIds })),
  );
  return {
    id: 's-1',
    userId: 'u-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'submitted',
    createdAt: 0,
    submittedAt: 1,
    items,
    result,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('recomputeCorrectedResult (완료 세트 정정 재계산)', () => {
  it('20문항 중 정답 1·오답 1을 제외하면 유효 18·정답 17·제외 2·정답률 94%', () => {
    const set = makeSubmittedSet([...Array<string>(12).fill('correct'), ...Array<string>(8).fill('wrong')] as Outcome[]);
    expect(set.result?.correctCount).toBe(12);

    const corrected = recomputeCorrectedResult(set, [versionIdOf(0), versionIdOf(12)]);

    expect(corrected.validTotal).toBe(18);
    expect(corrected.excludedCount).toBe(2);
    expect(corrected.correctCount).toBe(11);
    expect(corrected.answeredCount).toBe(18);
    expect(corrected.accuracyPercent).toBe(Math.round((11 / 18) * 100));
    expect(corrected.excludedQuestionVersionIds).toEqual([versionIdOf(0), versionIdOf(12)]);
    expect(corrected.perItem).toHaveLength(20);
    expect(corrected.perItem.filter((item) => item.excluded)).toHaveLength(2);
    expect(corrected.ungraded).toBe(false);
  });

  it('정답 문항을 제외하면 정답 수가 줄고 최초 result는 그대로다', () => {
    const set = makeSubmittedSet([...Array<string>(5).fill('correct'), ...Array<string>(5).fill('wrong')] as Outcome[]);

    const corrected = recomputeCorrectedResult(set, new Set([versionIdOf(1)]));

    expect(corrected.validTotal).toBe(9);
    expect(corrected.correctCount).toBe(4);
    expect(corrected.accuracyPercent).toBe(Math.round((4 / 9) * 100));
    expect(set.result?.correctCount).toBe(5);
    expect(set.result?.accuracyPercent).toBe(50);
    expect(corrected.perItem).not.toBe(set.result?.perItem);
  });

  it('pass/미응답은 유효 분모에 남으나 정답으로 세지 않는다', () => {
    const set = makeSubmittedSet(['correct', 'correct', 'wrong', 'pass', 'unanswered']);

    const corrected = recomputeCorrectedResult(set, []);

    expect(corrected.validTotal).toBe(5);
    expect(corrected.answeredCount).toBe(3);
    expect(corrected.passCount).toBe(1);
    expect(corrected.unansweredCount).toBe(1);
    expect(corrected.correctCount).toBe(2);
    expect(corrected.accuracyPercent).toBe(40);

    const partial = recomputeCorrectedResult(set, [versionIdOf(0)]);
    expect(partial.validTotal).toBe(4);
    expect(partial.passCount).toBe(1);
    expect(partial.unansweredCount).toBe(1);
    expect(partial.correctCount).toBe(1);
    expect(partial.accuracyPercent).toBe(25);
  });

  it('전부 제외해도 throw하지 않고 accuracy null·ungraded true(채점 불가)를 반환한다', () => {
    const set = makeSubmittedSet(['correct', 'wrong', 'pass']);

    const corrected = recomputeCorrectedResult(set, [versionIdOf(0), versionIdOf(1), versionIdOf(2)]);

    expect(corrected.validTotal).toBe(0);
    expect(corrected.accuracyPercent).toBeNull();
    expect(corrected.ungraded).toBe(true);
    expect(corrected.excludedCount).toBe(3);
    expect(corrected.correctCount).toBe(0);
    expect(corrected.perItem.every((item) => item.excluded)).toBe(true);
  });

  it('미제출 세트와 결과 없는 세트는 throw한다', () => {
    const active: StudySet = { ...makeSubmittedSet(['correct']), status: 'active' };
    expect(() => recomputeCorrectedResult(active, [])).toThrow(/active 세트/);

    const noResult: StudySet = { ...makeSubmittedSet(['correct']), result: undefined };
    expect(() => recomputeCorrectedResult(noResult, [])).toThrow(/결과가 필요/);
  });

  it('입력 세트·최초 결과를 변경하지 않는다(불변)', () => {
    const set = deepFreeze(makeSubmittedSet(['correct', 'wrong', 'pass', 'unanswered']));
    const before = JSON.stringify(set);

    const corrected = recomputeCorrectedResult(set, [versionIdOf(1)]);

    expect(JSON.stringify(set)).toBe(before);
    expect(set.result?.perItem.every((item) => !('excluded' in item))).toBe(true);
    expect(corrected.perItem[1]).toEqual({ ...set.result!.perItem[1], excluded: true });
  });
});
