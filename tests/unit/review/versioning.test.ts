import { describe, expect, it } from 'vitest';
import { applyRevision, currentWeight, makeInitialStats, recordAttempt } from '@/domain/review/versioning';
import type { ReviewAttempt } from '@/domain/review/types';

// 이슈 #51 개정 규칙 — 오탈자(가중치 유지) vs 실질 변경(초기화·미풀이), 이력·북마크 보존.

function attempt(overrides?: Partial<ReviewAttempt>): ReviewAttempt {
  return {
    sessionId: 'sess-1',
    userId: 'u1',
    mode: 'wrong',
    questionId: 'rq-1',
    questionVersionId: 'rqv-1-v1',
    response: { kind: 'answered', optionIds: ['a'] },
    correct: false,
    answeredAt: 1700000000,
    ...overrides,
  };
}

describe('recordAttempt (이력 영구 보존 + 복습 필요 표시 분리)', () => {
  it('오답은 유효 누적 오답 1회 증가 + 복습 필요 표시', () => {
    const stats = recordAttempt(makeInitialStats({ questionId: 'rq-1', questionVersionId: 'rqv-1-v1', versionNo: 1 }), attempt());
    expect(stats.validWrongCount).toBe(1);
    expect(stats.reviewNeeded).toBe(true);
    expect(stats.attempted).toBe(true);
    expect(stats.history).toHaveLength(1);
  });

  it('Pass·미응답 제출도 오답으로 계수된다', () => {
    const base = makeInitialStats({ questionId: 'rq-1', questionVersionId: 'rqv-1-v1', versionNo: 1 });
    const pass = recordAttempt(base, attempt({ response: { kind: 'pass' } }));
    const unanswered = recordAttempt(pass, attempt({ response: { kind: 'unanswered' } }));
    expect(unanswered.validWrongCount).toBe(2);
    expect(unanswered.reviewNeeded).toBe(true);
  });

  it('다시 정답이어도 이력은 유지되고 표시만 꺼진다', () => {
    const base = makeInitialStats({ questionId: 'rq-1', questionVersionId: 'rqv-1-v1', versionNo: 1 });
    const wrong = recordAttempt(base, attempt());
    const correct = recordAttempt(wrong, attempt({ correct: true, response: { kind: 'answered', optionIds: ['b'] } }));
    expect(correct.history).toHaveLength(2);
    expect(correct.validWrongCount).toBe(1); // 누적 오답 보존 — 가중치 유지
    expect(correct.reviewNeeded).toBe(false); // '현재 복습 필요' 표시는 분리
  });
});

describe('applyRevision (개정 가중치 규칙)', () => {
  function withHistory() {
    const base = makeInitialStats({ questionId: 'rq-1', questionVersionId: 'rqv-1-v1', versionNo: 1, bookmarked: true });
    return recordAttempt(recordAttempt(base, attempt()), attempt({ response: { kind: 'pass' } }));
  }

  it('오탈자/의미 동일(editorial) 개정 — 유효 오답 가중치 유지', () => {
    const stats = withHistory();
    expect(stats.validWrongCount).toBe(2);
    const revised = applyRevision(stats, { kind: 'editorial', questionVersionId: 'rqv-1-v2', versionNo: 2 });
    expect(revised.validWrongCount).toBe(2);
    expect(revised.questionVersionId).toBe('rqv-1-v2');
    expect(revised.versionNo).toBe(2);
    expect(currentWeight(revised)).toBe(3);
    expect(revised.history).toHaveLength(2);
    expect(revised.bookmarked).toBe(true);
  });

  it('정답/문제 조건/실질적 보기(substantive) 개정 — 가중치 초기화·미풀이, 이력·북마크 보존', () => {
    const stats = withHistory();
    const revised = applyRevision(stats, { kind: 'substantive', questionVersionId: 'rqv-1-v3', versionNo: 3 });
    expect(revised.validWrongCount).toBe(0);
    expect(revised.attempted).toBe(false); // 새 버전 미풀이 취급
    expect(currentWeight(revised)).toBe(1);
    expect(revised.history).toHaveLength(2); // 원본 이력 보존
    expect(revised.history).toEqual(stats.history);
    expect(revised.bookmarked).toBe(true); // 북마크 보존
    expect(revised.questionVersionId).toBe('rqv-1-v3');
  });

  it('초기화 후 다시 오답이 누적된다', () => {
    const revised = applyRevision(withHistory(), { kind: 'substantive', questionVersionId: 'rqv-1-v3', versionNo: 3 });
    const again = recordAttempt(revised, attempt({ questionVersionId: 'rqv-1-v3' }));
    expect(again.validWrongCount).toBe(1);
    expect(again.history).toHaveLength(3);
  });
});

describe('makeInitialStats (경계)', () => {
  it('새 문제는 오답 0·미풀이·북마크 없음', () => {
    const stats = makeInitialStats({ questionId: 'rq-9', questionVersionId: 'rqv-9-v1', versionNo: 1 });
    expect(stats).toMatchObject({ validWrongCount: 0, attempted: false, reviewNeeded: false, bookmarked: false });
    expect(currentWeight(stats)).toBe(1);
  });
});
