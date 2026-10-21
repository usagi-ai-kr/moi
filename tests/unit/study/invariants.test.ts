import { describe, expect, it } from 'vitest';
import type { StudySet } from '@/domain/study/types';
import {
  assertGradable,
  assertItemsImmutableAfterSubmit,
  assertStudySetInvariants,
  isActive,
  STUDY_SET_SIZE,
} from '@/domain/study/invariants';
import { makePoolEntry } from './fixtures';

// 이슈 #49 불변식 — 10문제(#187)·동일 문제 중복 0·제출 후 변경 불가·포기 후 채점 불가·활성 세트 1개.

function buildSet(overrides?: Partial<StudySet>): StudySet {
  const items = Array.from({ length: STUDY_SET_SIZE }, (_, i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}-v1`,
    versionNo: 1,
    optionOrder: ['a', 'b', 'c', 'd'],
    answerOptionIds: ['b'],
    stem: `문제 ${i} 본문`,
    options: ['a', 'b', 'c', 'd'].map((id) => ({ optionId: id, text: `보기 ${id} 내용` })),
    explanation: `문제 ${i} 해설`,
    sourceUrls: [`https://docs.aws.amazon.com/q-${i}`],
    response: { kind: 'unanswered' } as const,
  }));
  const base: StudySet = {
    id: 'set-1',
    userId: 'user-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'active',
    createdAt: 1000,
    items,
    ...overrides,
  };
  return base;
}

describe('불변식', () => {
  it('정상 활성 세트는 통과한다', () => {
    expect(() => assertStudySetInvariants(buildSet())).not.toThrow();
    expect(isActive(buildSet())).toBe(true);
    expect(STUDY_SET_SIZE).toBe(10);
  });

  it('문제 수가 10이 아니면 거부(9개·경계)', () => {
    const short = buildSet();
    const items = short.items.slice(0, 9);
    expect(() => assertStudySetInvariants({ ...short, items })).toThrow();
  });

  it('동일 문제 중복은 거부한다', () => {
    const dup = buildSet();
    const items = dup.items.map((item, i) => (i === 1 ? { ...item, questionId: 'q-0' } : item));
    expect(() => assertStudySetInvariants({ ...dup, items })).toThrow();
  });

  it('제출 후 세트는 변경 불가(변경 시도 함수 계약이 거부한다)', () => {
    const submitted = buildSet({ status: 'submitted', submittedAt: 2000 });
    expect(() => assertItemsImmutableAfterSubmit(submitted)).not.toThrow();
    expect(() => assertGradable(buildSet({ status: 'abandoned' }))).toThrow(); // 포기 후 채점 불가
  });

  it('포기 세트는 채점할 수 없다', () => {
    expect(() => assertGradable(buildSet({ status: 'abandoned' }))).toThrow();
    expect(() => assertGradable(buildSet({ status: 'submitted' }))).toThrow(); // 중복 채점 금지(결과 덮어쓰기 금지)
    expect(() => assertGradable(buildSet())).not.toThrow();
  });

  it('활성 세트 판정: submitted/abandoned는 활성이 아니다(새 세트 가능 근거)', () => {
    expect(isActive(buildSet({ status: 'submitted', submittedAt: 1 }))).toBe(false);
    expect(isActive(buildSet({ status: 'abandoned' }))).toBe(false);
  });

  it('영역 모드는 domainId가 필요하고 도메인 가중치는 풀에서 온다', () => {
    const entry = makePoolEntry({ domainIndex: 2 });
    expect(entry.domainWeight).toBe(120);
  });

  /** n문항 세트 — 10 초과분은 이어서 번호를 붙여 만든다. */
  function buildSetWithSize(n: number): StudySet {
    const base = buildSet();
    const items = [...base.items];
    for (let i = items.length; i < n; i += 1) {
      const prev = items[0] as (typeof items)[number];
      items.push({ ...prev, questionId: `q-${i}`, questionVersionId: `qv-${i}-v1`, stem: `문제 ${i} 본문` });
    }
    return { ...base, items: items.slice(0, n) };
  }

  it('1~8문항은 허용한다(새 세트 범위)', () => {
    for (let n = 1; n <= 8; n += 1) {
      expect(() => assertStudySetInvariants(buildSetWithSize(n))).not.toThrow();
    }
  });

  it('0문항은 거부한다', () => {
    expect(() => assertStudySetInvariants(buildSetWithSize(0))).toThrow();
  });

  it('9·19문항은 거부하고 기존 10·20문항은 허용한다', () => {
    expect(() => assertStudySetInvariants(buildSetWithSize(9))).toThrow();
    expect(() => assertStudySetInvariants(buildSetWithSize(19))).toThrow();
    expect(() => assertStudySetInvariants(buildSetWithSize(10))).not.toThrow();
    expect(() => assertStudySetInvariants(buildSetWithSize(20))).not.toThrow();
  });
});
