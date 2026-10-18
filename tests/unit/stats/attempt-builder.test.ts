import { describe, expect, it } from 'vitest';
import type { StudySet, StudySetItem } from '@/domain/study/types';
import { buildSetAttempts } from '@/app/stats/attempt-builder';

const NOW = Date.UTC(2026, 9, 18);

function item(questionId: string, kind: 'answered' | 'pass' | 'unanswered'): StudySetItem {
  return {
    questionId,
    questionVersionId: `v-${questionId}`,
    versionNo: 1,
    optionOrder: ['a', 'b'],
    answerOptionIds: ['a'],
    stem: `stem ${questionId}`,
    options: [
      { optionId: 'a', text: 'A' },
      { optionId: 'b', text: 'B' },
    ],
    explanation: `exp ${questionId}`,
    sourceUrls: [],
    response: kind === 'answered' ? { kind, optionIds: ['a'] } : { kind },
  };
}

/** 20문제 혼합 세트: 0-4 정답, 5-9 오답, 10-13 pass, 14-19 unanswered. */
function mixedSet(overrides?: Partial<StudySet>): StudySet {
  const kinds: Array<'answered' | 'pass' | 'unanswered'> = Array.from({ length: 20 }, (_, i) =>
    i < 10 ? 'answered' : i < 14 ? 'pass' : 'unanswered',
  );
  const items = kinds.map((kind, i) => item(`q${String(i).padStart(2, '0')}`, kind));
  const perItem = items.map((it, i) => ({
    questionId: it.questionId,
    responseKind: kinds[i],
    selectedOptionIds: kinds[i] === 'answered' ? (['a'] as const as string[]) : [],
    correctOptionIds: ['a'],
    correct: kinds[i] === 'answered' ? i < 5 : false,
  }));
  return {
    id: 'set-1',
    userId: 'u1',
    examId: 'AWS-SAA-C03',
    mode: 'all',
    status: 'submitted',
    createdAt: NOW - 1000,
    items,
    submittedAt: NOW,
    result: {
      answeredCount: 10,
      correctCount: 5,
      accuracyPercent: 25,
      passCount: 4,
      unansweredCount: 6,
      perItem,
    },
    ...overrides,
  };
}

describe('buildSetAttempts', () => {
  it('20문제 outcome 매핑·firstAttempt는 prior 없는 correct/wrong만 true', () => {
    const attempts = buildSetAttempts({ set: mixedSet(), priorGradedQuestionIds: new Set() });
    expect(attempts).toHaveLength(20);
    expect(attempts.map((a) => a.outcome)).toEqual([
      ...Array(5).fill('correct'),
      ...Array(5).fill('wrong'),
      ...Array(4).fill('pass'),
      ...Array(6).fill('unanswered'),
    ]);
    expect(attempts.filter((a) => a.firstAttempt).map((a) => a.questionId)).toEqual([
      ...Array.from({ length: 5 }, (_, i) => `q${String(i).padStart(2, '0')}`),
      ...Array.from({ length: 5 }, (_, i) => `q${String(i + 5).padStart(2, '0')}`),
    ]);
    expect(attempts.map((a) => a.questionId)).toEqual(
      Array.from({ length: 20 }, (_, i) => `q${String(i).padStart(2, '0')}`),
    );
    for (const a of attempts) {
      expect(a.source).toBe('set');
      expect(a.sourceId).toBe('set-1');
      expect(a.occurredAt).toBe(NOW);
      expect(a.excludedAt).toBeNull();
    }
  });

  it('prior에 있는 correct/wrong은 firstAttempt false', () => {
    const attempts = buildSetAttempts({
      set: mixedSet(),
      priorGradedQuestionIds: new Set(['q00', 'q05']),
    });
    expect(attempts[0].firstAttempt).toBe(false);
    expect(attempts[5].firstAttempt).toBe(false);
    expect(attempts[1].firstAttempt).toBe(true);
    expect(attempts[6].firstAttempt).toBe(true);
  });

  it('pass/unanswered는 prior와 무관하게 firstAttempt false', () => {
    const attempts = buildSetAttempts({
      set: mixedSet(),
      priorGradedQuestionIds: new Set(['q10', 'q14']),
    });
    expect(attempts[10].outcome).toBe('pass');
    expect(attempts[14].outcome).toBe('unanswered');
    expect(attempts.slice(10).every((a) => a.firstAttempt === false)).toBe(true);
  });

  it('submitted 아님/result 없음/perItem 누락이면 throw', () => {
    expect(() =>
      buildSetAttempts({ set: mixedSet({ status: 'active' }), priorGradedQuestionIds: [] }),
    ).toThrow();
    expect(() =>
      buildSetAttempts({ set: mixedSet({ result: undefined }), priorGradedQuestionIds: [] }),
    ).toThrow();
    const set = mixedSet();
    const broken: StudySet = {
      ...set,
      result: { ...set.result!, perItem: set.result!.perItem.slice(1) },
    };
    expect(() => buildSetAttempts({ set: broken, priorGradedQuestionIds: [] })).toThrow();
  });

  it('attemptId 기본 `${set.id}:${questionId}`·idFactory 주입·submittedAt 없으면 now', () => {
    const attempts = buildSetAttempts({ set: mixedSet(), priorGradedQuestionIds: [] });
    expect(attempts[0].attemptId).toBe('set-1:q00');
    const custom = buildSetAttempts({
      set: mixedSet(),
      priorGradedQuestionIds: [],
      idFactory: ({ questionId, index }) => `custom-${index}-${questionId}`,
    });
    expect(custom[0].attemptId).toBe('custom-0-q00');
    expect(custom[19].attemptId).toBe('custom-19-q19');
    const noSubmitted = mixedSet({ submittedAt: undefined });
    const fallback = buildSetAttempts({ set: noSubmitted, priorGradedQuestionIds: [], now: NOW + 1 });
    expect(fallback[0].occurredAt).toBe(NOW + 1);
  });
});
