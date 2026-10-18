import { describe, expect, it } from 'vitest';
import { gradeItems, type GradableItem, type VersionAnswer } from '@/domain/study/grading';

// 이슈 #49 규칙 — 20문제 일괄 채점: optionId 집합 완전 일치 정답·Pass/미응답 오답·정답률/Pass/미응답 요약.

function item(questionId: string, response: GradableItem['response']): GradableItem {
  return {
    questionId,
    questionVersionId: `qv-${questionId}`,
    response,
  };
}

const ANSWERS: VersionAnswer[] = [
  { questionVersionId: 'qv-1', answerOptionIds: ['b'] },
  { questionVersionId: 'qv-2', answerOptionIds: ['a', 'c'] }, // 복수 정답
];

describe('gradeItems (일괄 채점)', () => {
  it('단일 선택: 선택 집합이 정답 집합과 완전 일치하면 정답', () => {
    const result = gradeItems([item('1', { kind: 'answered', optionIds: ['b'] })], ANSWERS);
    expect(result.perItem[0]?.correct).toBe(true);
    expect(result.perItem[0]?.selectedOptionIds).toEqual(['b']);
    expect(result.perItem[0]?.correctOptionIds).toEqual(['b']);
    expect(result.correctCount).toBe(1);
    expect(result.accuracyPercent).toBe(100);
  });

  it('집합 기준: 순서가 달라도 같은 집합이면 정답(복수 선택)', () => {
    const result = gradeItems([item('2', { kind: 'answered', optionIds: ['c', 'a'] })], ANSWERS);
    expect(result.perItem[0]?.correct).toBe(true);
  });

  it('불완전 집합은 오답: 하나 누락·하나 추가 모두 실패', () => {
    const fewer = gradeItems([item('2', { kind: 'answered', optionIds: ['a'] })], ANSWERS);
    const extra = gradeItems([item('2', { kind: 'answered', optionIds: ['a', 'b', 'c'] })], ANSWERS);
    expect(fewer.perItem[0]?.correct).toBe(false);
    expect(extra.perItem[0]?.correct).toBe(false);
  });

  it('Pass·미응답은 오답이며 요약에 구분 기록된다', () => {
    const result = gradeItems([item('1', { kind: 'pass' }), item('2', { kind: 'unanswered' })], ANSWERS);
    expect(result.perItem.map((i) => i.correct)).toEqual([false, false]);
    expect(result.passCount).toBe(1);
    expect(result.unansweredCount).toBe(1);
    expect(result.correctCount).toBe(0);
    expect(result.accuracyPercent).toBe(0);
  });

  it('정답률 요약: 20문제 중 15정답·2Pass·3미응답 → 75%', () => {
    const items: GradableItem[] = [
      ...Array.from({ length: 15 }, (_, i) => item(`${i}`, { kind: 'answered', optionIds: ['b'] })),
      ...Array.from({ length: 2 }, (_, i) => item(`p${i}`, { kind: 'pass' })),
      ...Array.from({ length: 3 }, (_, i) => item(`u${i}`, { kind: 'unanswered' })),
    ];
    const wideAnswers: VersionAnswer[] = items.map((i) => ({ questionVersionId: i.questionVersionId, answerOptionIds: ['b'] }));
    const result = gradeItems(items, wideAnswers);

    expect(result.accuracyPercent).toBe(75);
    expect(result.answeredCount).toBe(15);
    expect(result.passCount).toBe(2);
    expect(result.unansweredCount).toBe(3);
  });

  it('정답 집합이 누락된 개정(데이터 결함)은 오답으로 fail-closed', () => {
    const result = gradeItems([item('9', { kind: 'answered', optionIds: ['b'] })], []);
    expect(result.perItem[0]?.correct).toBe(false);
  });
});
