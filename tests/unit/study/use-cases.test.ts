import { describe, expect, it } from 'vitest';
import type { StudySet } from '@/domain/study/types';
import { answerStudyItem, startStudySet, submitStudySet, abandonStudySet, listCompletedSets } from '@/app/study';
import type { QuestionPool, StudySetRepository, StudyClock, StudyRng } from '@/app/study/ports';
import { makePoolEntry, seededRng, DOMAIN_CODES } from './fixtures';

// 이슈 #49 use case — Start/Answer/Submit/Abandon/List fake port 단위 테스트.

function activePool(count: number, domainIndex = 0): QuestionPool {
  return {
    async listPool() {
      return Array.from({ length: count }, (_, i) => makePoolEntry({ questionId: `pool-q-${i}`, index: i, domainIndex }));
    },
  };
}

function repoWith(sets: Map<string, StudySet>) {
  const repository: StudySetRepository = {
    async findActive({ userId, examId }) {
      for (const set of sets.values()) {
        if (set.userId === userId && set.examId === examId && set.status === 'active') return set;
      }
      return null;
    },
    async save({ set }) {
      sets.set(set.id, set);
    },
    async findById({ id }) {
      return sets.get(id) ?? null;
    },
    async listCompleted({ page, pageSize }) {
      const completed = [...sets.values()].filter((set) => set.status === 'submitted').sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
      const start = (page - 1) * pageSize;
      return { items: completed.slice(start, start + pageSize), total: completed.length };
    },
  };
  return repository;
}

function fakes(overrides?: { poolCount?: number; seed?: number }) {
  const sets = new Map<string, StudySet>();
  const clock: StudyClock = { now: () => 1700000000 };
  const rng: StudyRng = { next: seededRng(overrides?.seed ?? 123) };
  const pool = activePool(overrides?.poolCount ?? 30);
  return { sets, clock, rng, pool, repository: repoWith(sets) };
}

describe('StartStudySet (활성 세트 1개·스냅샷)', () => {
  it('활성 세트가 없으면 20문제 세트를 시작하고 스냅샷을 고정한다', async () => {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });

    expect(result.outcome).toBe('started');
    if (result.outcome === 'started') {
      expect(result.set.items).toHaveLength(20);
      expect(result.set.status).toBe('active');
      expect(result.set.createdAt).toBe(1700000000);
      for (const item of result.set.items) {
        expect(item.versionNo).toBe(1);
        expect([...item.optionOrder].sort()).toEqual(['a', 'b', 'c', 'd']);
      }
    }
  });

  it('활성 세트가 있으면 거부하고 이어풀기 사유를 반환한다', async () => {
    const f = fakes();
    await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });

    const second = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'domain', domainId: DOMAIN_CODES[0] });

    expect(second).toMatchObject({ outcome: 'rejected', reason: 'active_set_exists' });
  });

  it('다른 시험은 별개다: 활성 1개는 시험별로 허용된다', async () => {
    const f = fakes();
    const first = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    const other = await startStudySet(f, { userId: 'u1', examId: 'clp-c02', mode: 'all' });
    expect(first.outcome).toBe('started');
    expect(other.outcome).toBe('started');
  });

  it('영역 모드는 domainId가 없으면 거부한다', async () => {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'domain' });
    expect(result).toMatchObject({ outcome: 'rejected', reason: 'domain_required' });
  });

  it('풀이 소진되지 않은 풀(30문제)에서도 세트 내 중복은 0이다', async () => {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    if (result.outcome === 'started') {
      expect(new Set(result.set.items.map((item) => item.questionId)).size).toBe(20);
    }
  });

  it('풀이 가능한 문제가 20개 미만이면 거부한다(경계 19)', async () => {
    const f = fakes({ poolCount: 19 });
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    expect(result).toMatchObject({ outcome: 'rejected', reason: 'pool_insufficient' });
  });
});

describe('AnswerStudyItem (선택/Pass/미응답·제출 전 변경 가능)', () => {
  async function startedSet() {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    const set = f.sets.get((result as { set?: StudySet }).set?.id ?? '') as StudySet;
    return { f, set };
  }

  it('답안 선택(옵션 id 부분집합 검증)', async () => {
    const { f, set } = await startedSet();
    const questionId = set.items[0]?.questionId ?? '';
    const ok = await answerStudyItem(f, { setId: set.id, userId: 'u1', questionId, response: { kind: 'answered', optionIds: ['a'] } });
    expect(ok.outcome).toBe('answered');
    expect((f.sets.get(set.id)?.items[0]?.response as { kind: string }).kind).toBe('answered');
    const bad = await answerStudyItem(f, { setId: set.id, userId: 'u1', questionId, response: { kind: 'answered', optionIds: ['zzz'] } });
    expect(bad).toMatchObject({ outcome: 'rejected', reason: 'unknown_option' });
  });

  it('Pass → 취소(미응답) → 다시 답변(제출 전 변경 가능)', async () => {
    const { f, set } = await startedSet();
    const questionId = set.items[0]?.questionId ?? '';
    await answerStudyItem(f, { setId: set.id, userId: 'u1', questionId, response: { kind: 'pass' } });
    expect((f.sets.get(set.id)?.items[0]?.response as { kind: string }).kind).toBe('pass');
    await answerStudyItem(f, { setId: set.id, userId: 'u1', questionId, response: { kind: 'unanswered' } });
    expect((f.sets.get(set.id)?.items[0]?.response as { kind: string }).kind).toBe('unanswered');
    await answerStudyItem(f, { setId: set.id, userId: 'u1', questionId, response: { kind: 'answered', optionIds: ['a'] } });
    expect((f.sets.get(set.id)?.items[0]?.response as { kind: string }).kind).toBe('answered');
  });

  it('제출 후에는 변경이 거부된다(불변식)', async () => {
    const { f, set } = await startedSet();
    await submitStudySet(f, { setId: set.id, userId: 'u1', confirmUnanswered: true });
    const rejected = await answerStudyItem(f, { setId: set.id, userId: 'u1', questionId: set.items[0]?.questionId ?? '', response: { kind: 'pass' } });
    expect(rejected).toMatchObject({ outcome: 'rejected', reason: 'not_active' });
  });
});

describe('SubmitStudySet (일괄 채점·미응답 확인)', () => {
  it('미응답이 있으면 confirmUnanswered 없이 거부된다', async () => {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    const set = (result as { set?: StudySet }).set as StudySet;
    const rejected = await submitStudySet(f, { setId: set.id, userId: 'u1', confirmUnanswered: false });
    expect(rejected).toMatchObject({ outcome: 'rejected', reason: 'unanswered_not_confirmed' });
    expect(f.sets.get(set.id)?.status).toBe('active');
  });

  it('확인 후 제출: 전체 20문제 채점·결과 요약·이후 변경 불가', async () => {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    const set = (result as { set?: StudySet }).set as StudySet;
    for (const item of set.items) {
      await answerStudyItem(f, { setId: set.id, userId: 'u1', questionId: item.questionId, response: { kind: 'answered', optionIds: ['b'] } });
    }
    // 정답이 'b'인 개정(fake pool 기본) → 전부 정답
    const submitted = await submitStudySet(f, { setId: set.id, userId: 'u1', confirmUnanswered: false });
    expect(submitted.outcome).toBe('submitted');
    const result_ = f.sets.get(set.id)?.result;
    expect(result_?.accuracyPercent).toBe(100);
    expect(f.sets.get(set.id)?.submittedAt).toBe(1700000000);
    // 포기가 아닌 제출 후 채점 재시도 금지
    const again = await submitStudySet(f, { setId: set.id, userId: 'u1', confirmUnanswered: true });
    expect(again).toMatchObject({ outcome: 'rejected', reason: 'not_active' });
  });

  it('개정 후에도 스냅샷 정답으로 채점한다(세트 채점 불변)', async () => {
    let liveAnswers = ['b'];
    const pool: QuestionPool = {
      async listPool() {
        return Array.from({ length: 30 }, (_, i) =>
          makePoolEntry({
            questionId: `rq-${i}`,
            index: i,
            version: {
              questionVersionId: `rqv-${i}-v1`,
              versionNo: 1,
              optionIds: ['a', 'b', 'c', 'd'],
              answerOptionIds: [...liveAnswers],
            },
          }),
        );
      },
    };
    const sets = new Map<string, StudySet>();
    const clock: StudyClock = { now: () => 1700000000 };
    const rng: StudyRng = { next: seededRng(7) };
    const deps = { pool, repository: repoWith(sets), clock, rng };
    const started = await startStudySet(deps, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    const set = (started as { set?: StudySet }).set as StudySet;
    expect(set.items[0]?.answerOptionIds).toEqual(['b']);
    for (const item of set.items) {
      await answerStudyItem(deps, { setId: set.id, userId: 'u1', questionId: item.questionId, response: { kind: 'answered', optionIds: ['b'] } });
    }
    liveAnswers = ['c']; // 시작 후 문제 개정 시뮬레이션
    const submitted = await submitStudySet(deps, { setId: set.id, userId: 'u1', confirmUnanswered: false });
    expect(submitted.outcome).toBe('submitted');
    expect(sets.get(set.id)?.result?.accuracyPercent).toBe(100);
  });

  it('Pass/미응답은 오답으로 채점되고 요약에 포함된다', async () => {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    const set = (result as { set?: StudySet }).set as StudySet;
    await answerStudyItem(f, { setId: set.id, userId: 'u1', questionId: set.items[0].questionId, response: { kind: 'pass' } });
    const submitted = await submitStudySet(f, { setId: set.id, userId: 'u1', confirmUnanswered: true });
    expect(submitted.outcome).toBe('submitted');
    const result_ = f.sets.get(set.id)?.result;
    expect(result_?.accuracyPercent).toBe(0);
    expect(result_?.passCount).toBe(1);
    expect(result_?.unansweredCount).toBe(19);
  });
});

describe('AbandonStudySet (명시 확인·채점 미반영)', () => {
  it('확인 없으면 거부, 확인하면 abandoned + result 없음', async () => {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    const set = (result as { set?: StudySet }).set as StudySet;
    const noConfirm = await abandonStudySet(f, { setId: set.id, userId: 'u1', confirm: false });
    expect(noConfirm).toMatchObject({ outcome: 'rejected', reason: 'not_confirmed' });
    const done = await abandonStudySet(f, { setId: set.id, userId: 'u1', confirm: true });
    expect(done).toMatchObject({ outcome: 'abandoned' });
    const saved = f.sets.get(set.id) as StudySet;
    expect(saved.status).toBe('abandoned');
    expect(saved.result).toBeUndefined();
  });

  it('포기 후 새 세트를 시작할 수 있다', async () => {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    const set = (result as { set?: StudySet }).set as StudySet;
    await abandonStudySet(f, { setId: set.id, userId: 'u1', confirm: true });
    const next = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    expect(next.outcome).toBe('started');
  });
});

describe('ListCompletedSets (이력 페이지네이션·상세)', () => {
  it('완료 세트 목록: 날짜·영역·정답률 요약 + 페이지네이션', async () => {
    const f = fakes();
    for (let i = 0; i < 3; i += 1) {
      const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'domain', domainId: DOMAIN_CODES[0] });
      const set = (result as { set?: StudySet }).set as StudySet;
      await submitStudySet(f, { setId: set.id, userId: 'u1', confirmUnanswered: true });
    }
    const page1 = await listCompletedSets(f, { userId: 'u1', page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    for (const item of page1.items) {
      expect(item).toMatchObject({ accuracyPercent: 0, submittedAt: expect.any(Number) });
    }
    const page2 = await listCompletedSets(f, { userId: 'u1', page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(1);
  });

  it('상세 조회는 findById로 가능하고 제출 이후 items는 불변이다', async () => {
    const f = fakes();
    const result = await startStudySet(f, { userId: 'u1', examId: 'saa-c03', mode: 'all' });
    const set = (result as { set?: StudySet }).set as StudySet;
    await submitStudySet(f, { setId: set.id, userId: 'u1', confirmUnanswered: true });
    const detail = await f.repository.findById({ id: set.id }) as StudySet;
    expect(detail.status).toBe('submitted');
    expect(detail.items).toHaveLength(20);
  });
});
