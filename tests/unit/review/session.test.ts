import { describe, expect, it } from 'vitest';
import { assertSessionOwned, assertReviewSessionInvariants, isEnded } from '@/domain/review/invariants';
import { buildReviewSession, endSession, gradeCurrent, isExhausted, summarize } from '@/domain/review/session';
import { REVIEW_MIN_CANDIDATES } from '@/domain/review/thresholds';
import type { ReviewSession } from '@/domain/review/types';
import { makeCandidates, makeCandidate, scriptedRng, seededRng } from './fixtures';

// 이슈 #51 회차 스냅샷·즉시 채점·종료·불변식.

function draft(candidates = makeCandidates(4, { 0: 3, 2: 1 }), rng = seededRng(11)) {
  return {
    id: 'sess-1',
    userId: 'u1',
    examId: 'saa-c03',
    mode: 'wrong' as const,
    candidates,
    createdAt: 1700000000,
    rng,
  };
}

function graded(session: ReviewSession, questionId: string, correct = true, now = 1700000001): ReviewSession {
  const result = gradeCurrent(session, {
    questionId,
    response: correct
      ? { kind: 'answered', optionIds: ['b'] }
      : { kind: 'answered', optionIds: ['a'] },
    now,
  });
  if ('outcome' in result) throw new Error(`unexpected reject: ${result.reason}`);
  return result.session;
}

describe('buildReviewSession (대상·순서 스냅샷)', () => {
  it('대상·개정·보기 순서를 고정하고 모두 미채점으로 시작한다', () => {
    const session = buildReviewSession(draft());
    expect(session.items).toHaveLength(4);
    expect(session.cursor).toBe(0);
    expect(session.status).toBe('active');
    expect(session.createdAt).toBe(1700000000);
    for (const item of session.items) {
      expect(item.state).toEqual({ kind: 'pending' });
      expect(item.questionVersionId).toMatch(/-v1$/);
      expect([...item.optionOrder].sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(item.answerOptionIds).toEqual(['b']);
    }
    assertReviewSessionInvariants(session);
  });

  it('회차 내 중복 0 — 시작 시 고정된다', () => {
    const session = buildReviewSession(draft(makeCandidates(4, { 0: 4 })));
    expect(new Set(session.items.map((item) => item.questionId)).size).toBe(4);
  });

  it('동일 시드면 같은 회차(결정적), 다른 시드면 순서가 달라질 수 있다', () => {
    const a = buildReviewSession(draft(makeCandidates(4, { 0: 3 }), seededRng(2)));
    const b = buildReviewSession(draft(makeCandidates(4, { 0: 3 }), seededRng(2)));
    expect(a.items.map((i) => i.questionId)).toEqual(b.items.map((i) => i.questionId));
    expect(a.items.map((i) => i.optionOrder)).toEqual(b.items.map((i) => i.optionOrder));
  });

  it('대상 0 시작 금지 — 경계(REVIEW_MIN_CANDIDATES)', () => {
    expect(REVIEW_MIN_CANDIDATES).toBe(1);
    expect(() => buildReviewSession(draft([], scriptedRng([0])))).toThrow(/최소 1문제/);
  });

  it('중복 후보는 불변식 위반으로 거부된다', () => {
    const dup = [makeCandidate({ index: 0 }), makeCandidate({ index: 0 })];
    expect(() => buildReviewSession(draft(dup))).toThrow(/중복 금지/);
  });
});

describe('gradeCurrent (한 문제 즉시 채점)', () => {
  it('정답 스냅샷과 일치하면 정답, 아니면 오답 — 즉시 판정', () => {
    const session = buildReviewSession(draft());
    const current = session.items[0];
    const ok = gradeCurrent(session, { questionId: current.questionId, response: { kind: 'answered', optionIds: ['b'] }, now: 1 });
    if ('outcome' in ok) throw new Error('unexpected reject');
    expect(ok.correct).toBe(true);
    expect(ok.attempt).toMatchObject({ sessionId: 'sess-1', userId: 'u1', correct: true, answeredAt: 1 });
    expect(ok.session.items[0]?.state).toEqual({ kind: 'graded', response: { kind: 'answered', optionIds: ['b'] }, correct: true, gradedAt: 1 });
    expect(ok.session.cursor).toBe(1);

    const ng = gradeCurrent(ok.session, { questionId: ok.session.items[1]?.questionId ?? '', response: { kind: 'answered', optionIds: ['a'] }, now: 2 });
    if ('outcome' in ng) throw new Error('unexpected reject');
    expect(ng.correct).toBe(false);
  });

  it('Pass는 오답으로 채점되고 즉시 이력에 남는다', () => {
    const session = buildReviewSession(draft());
    const result = gradeCurrent(session, { questionId: session.items[0]?.questionId ?? '', response: { kind: 'pass' }, now: 5 });
    if ('outcome' in result) throw new Error('unexpected reject');
    expect(result.correct).toBe(false);
    expect(result.attempt.response).toEqual({ kind: 'pass' });
  });

  it('순서 고정 — 현재 커서가 아닌 문제는 거부한다', () => {
    const session = buildReviewSession(draft());
    const result = gradeCurrent(session, { questionId: session.items[2]?.questionId ?? '', response: { kind: 'pass' }, now: 1 });
    expect(result).toEqual({ outcome: 'rejected', reason: 'not_current' });
  });

  it('알 수 없는 보기는 거부한다', () => {
    const session = buildReviewSession(draft());
    const result = gradeCurrent(session, { questionId: session.items[0]?.questionId ?? '', response: { kind: 'answered', optionIds: ['zzz'] }, now: 1 });
    expect(result).toEqual({ outcome: 'rejected', reason: 'unknown_option' });
  });

  it('채점 완료 후 추가 채점은 거부된다(재채점 금지·경계)', () => {
    const session = buildReviewSession(draft(makeCandidates(1)));
    const only = session.items[0]?.questionId ?? '';
    const first = graded(session, only);
    expect(isExhausted(first)).toBe(true);
    const again = gradeCurrent(first, { questionId: only, response: { kind: 'pass' }, now: 9 });
    expect(again).toEqual({ outcome: 'rejected', reason: 'not_current' });
  });

  it('채점된 커서 앞 문제를 다시 채점하면 거부한다', () => {
    const session = buildReviewSession(draft(makeCandidates(2)));
    const first = graded(session, session.items[0]?.questionId ?? '');
    // 커서는 1이므로 첫 문제 재채점은 not_current로 거부된다(순서 고정).
    const again = gradeCurrent(first, { questionId: first.items[0]?.questionId ?? '', response: { kind: 'pass' }, now: 9 });
    expect(again).toEqual({ outcome: 'rejected', reason: 'not_current' });
  });
});

describe('#308 선택 개수 계약 (gradeCurrent)', () => {
  it('Given 단일 선택 문항 When 2개 option 답변 요청 Then invalid_selection_count로 거부하고 채점·이력 데이터가 오염되지 않는다', () => {
    const session = buildReviewSession(draft());
    const current = session.items[0];
    const result = gradeCurrent(session, { questionId: current.questionId, response: { kind: 'answered', optionIds: ['a', 'b'] }, now: 1 });
    expect(result).toEqual({ outcome: 'rejected', reason: 'invalid_selection_count' });
    // 오염 없음 — 상태는 pending, 커서 유지.
    expect(session.items[0]?.state).toEqual({ kind: 'pending' });
    expect(session.cursor).toBe(0);
  });

  it('Given 단일 선택 문항 When 정확히 1개 option 답변 Then 기존 계약대로 즉시 채점된다', () => {
    const session = buildReviewSession(draft());
    const current = session.items[0];
    const ok = gradeCurrent(session, { questionId: current.questionId, response: { kind: 'answered', optionIds: ['b'] }, now: 1 });
    if ('outcome' in ok) throw new Error('unexpected reject');
    expect(ok.correct).toBe(true);
  });

  it('Given 복수(정답 2개) 문항 When 정해진 2개 option 답변 Then 채점 정확하다(계약 유지)', () => {
    const session = buildReviewSession(draft(makeCandidates(1, { 0: 1 })));
    // 개별 후보의 스냅샷 정답을 2개로 교체한다 — gradeCurrent는 스냅샷 answerOptionIds로 판정한다.
    const current = session.items[0];
    const multiSession: ReviewSession = {
      ...session,
      items: session.items.map((item) => (item.questionId === current.questionId ? { ...item, answerOptionIds: ['a', 'b'] } : item)),
    };
    const ok = gradeCurrent(multiSession, { questionId: current.questionId, response: { kind: 'answered', optionIds: ['b', 'a'] }, now: 1 });
    if ('outcome' in ok) throw new Error('unexpected reject');
    expect(ok.correct).toBe(true);
  });
});

describe('endSession (직접 종료·미채점 보존)', () => {
  it('종료 후 상태·시각이 고정되고 채점은 거부된다(불변식)', () => {
    const session = buildReviewSession(draft());
    const partial = graded(session, session.items[0]?.questionId ?? '');
    const ended = endSession(partial, { now: 99 });
    if ('outcome' in ended) throw new Error('unexpected reject');
    expect(ended.session.status).toBe('ended');
    expect(ended.session.endedAt).toBe(99);
    expect(isEnded(ended.session)).toBe(true);
    const after = gradeCurrent(ended.session, { questionId: ended.session.items[1]?.questionId ?? '', response: { kind: 'pass' }, now: 100 });
    expect(after).toEqual({ outcome: 'rejected', reason: 'not_active' });
    expect(endSession(ended.session, { now: 101 })).toEqual({ outcome: 'rejected', reason: 'not_active' });
  });

  it('미채점 문제는 종료 시에도 오답 처리하지 않는다', () => {
    const session = buildReviewSession(draft(makeCandidates(3)));
    const first = session.items[0]?.questionId ?? '';
    const partial = graded(session, first, false);
    const ended = endSession(partial, { now: 50 });
    if ('outcome' in ended) throw new Error('unexpected reject');
    const summary = summarize(ended.session);
    expect(summary).toMatchObject({ total: 3, graded: 1, pending: 2, correct: 0 });
    for (const item of ended.session.items.slice(1)) expect(item.state).toEqual({ kind: 'pending' });
  });
});

describe('소유권·소진 (불변식)', () => {
  it('다른 사용자/시험 세션 접근 금지', () => {
    const session = buildReviewSession(draft());
    expect(assertSessionOwned(session, { userId: 'u1', examId: 'saa-c03' })).toBe(true);
    expect(assertSessionOwned(session, { userId: 'u2', examId: 'saa-c03' })).toBe(false);
    expect(assertSessionOwned(session, { userId: 'u1', examId: 'clp-c02' })).toBe(false);
  });

  it('전부 채점하면 소진 — 다음 회차는 최신 목록을 다시 섞는다', () => {
    const session = buildReviewSession(draft(makeCandidates(2)));
    expect(isExhausted(session)).toBe(false);
    const after = graded(session, session.items[0]?.questionId ?? '');
    expect(isExhausted(after)).toBe(false);
    const done = graded(after, after.items[1]?.questionId ?? '');
    expect(isExhausted(done)).toBe(true);
  });

  it('커서 범위 위반은 불변식으로 거부된다', () => {
    const session = buildReviewSession(draft(makeCandidates(2)));
    expect(() => assertReviewSessionInvariants({ ...session, cursor: 99 })).toThrow(/커서/);
  });
});
