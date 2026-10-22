import { describe, expect, it } from 'vitest';
import { collectCompletedAttemptedQuestionIds } from '@/infra/persistence/study-pool-history';

describe('학습 풀의 완료 풀이 집계 (#311)', () => {
  it('동일 계정·시험의 제출된 채점 시도만 안정적인 questionId로 집계한다', () => {
    const attempts = [
      { userId: 'u1', examId: 'e1', questionId: 'q-correct', source: 'set', setStatus: 'submitted', outcome: 'correct' },
      { userId: 'u1', examId: 'e1', questionId: 'q-wrong', source: 'set', setStatus: 'submitted', outcome: 'wrong' },
      { userId: 'u1', examId: 'e1', questionId: 'q-correct', source: 'set', setStatus: 'submitted', outcome: 'wrong' },
      { userId: 'u1', examId: 'e1', questionId: 'q-pass', source: 'set', setStatus: 'submitted', outcome: 'pass' },
      { userId: 'u1', examId: 'e1', questionId: 'q-unanswered', source: 'set', setStatus: 'submitted', outcome: 'unanswered' },
      { userId: 'u1', examId: 'e1', questionId: 'q-active', source: 'set', setStatus: 'active', outcome: 'correct' },
      { userId: 'u1', examId: 'e1', questionId: 'q-abandoned', source: 'set', setStatus: 'abandoned', outcome: 'wrong' },
      { userId: 'u2', examId: 'e1', questionId: 'q-other-user', source: 'set', setStatus: 'submitted', outcome: 'correct' },
      { userId: 'u1', examId: 'e2', questionId: 'q-other-exam', source: 'set', setStatus: 'submitted', outcome: 'wrong' },
      { userId: 'u1', examId: 'e1', questionId: 'q-review', source: 'review', setStatus: 'submitted', outcome: 'wrong' },
    ];

    const attempted = collectCompletedAttemptedQuestionIds(attempts, { userId: 'u1', examId: 'e1' });

    expect([...attempted].sort()).toEqual(['q-correct', 'q-wrong']);
  });
});
