import { describe, expect, it } from 'vitest';
import { answerReviewItem, endReviewSession, getReviewCandidatesView, resumeReviewSession, startReviewSession } from '@/app/review';
import { buildReviewSession } from '@/domain/review/session';
import type { ReviewSession } from '@/domain/review/types';
import { REVIEW_ROUND_SIZE } from '@/domain/review/thresholds';
import { fakeGradingRepository, fakeRepository, fakeSource, fakeTimeRng, makeCandidates } from './fixtures';

// #221 BDD(ADR-0059): 25→10→10→5→새 cycle, ≤10 전체, append/remove, early end 재입대, resume/격리.
function fakes(n: number, seed = 7) {
  const src = fakeSource({ wrong: makeCandidates(n), bookmarked: makeCandidates(3) });
  const repo = fakeRepository();
  const grading = fakeGradingRepository(repo.sessions);
  const { clock, rng } = fakeTimeRng(seed);
  const deps = { source: src.source, repository: repo.repository, grading: grading.repository, clock, rng };
  return { deps, src, repo, grading };
}

async function gradeAll(deps: ReturnType<typeof fakes>['deps'], session: ReviewSession, count: number) {
  let cur = session;
  for (let i = 0; i < count; i += 1) {
    const qid = cur.items[cur.cursor]?.questionId ?? '';
    const r = await answerReviewItem(deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: qid, response: { kind: 'pass' } });
    if (r.outcome !== 'answered') throw new Error(`answer failed at ${i}`);
    cur = r.session;
  }
  return cur;
}

describe('review 10문항 회차 queue (app fake)', () => {
  it('1) 후보 25 → total 25, start 8', async () => {
    expect(REVIEW_ROUND_SIZE).toBe(10);
    const f = fakes(25);
    const view = await getReviewCandidatesView(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(view.total).toBe(25);
    expect(view.candidates).toHaveLength(25);
    const started = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    expect(started.outcome).toBe('started');
    if (started.outcome === 'started') expect(started.session.items).toHaveLength(8);
  });

  it('2) 8씩 채점·종료하면 8→8→8→1(남은 1문항)', async () => {
    const f = fakes(25, 11);
    const s1 = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (s1.outcome !== 'started') throw new Error('s1 failed');
    await gradeAll(f.deps, s1.session, 8);
    expect((await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' })).outcome).toBe('ended');
    const s2 = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (s2.outcome !== 'started') throw new Error('s2 failed');
    expect(s2.session.items).toHaveLength(8);
    await gradeAll(f.deps, s2.session, 8);
    expect((await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' })).outcome).toBe('ended');
    const s3 = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (s3.outcome !== 'started') throw new Error('s3 failed');
    expect(s3.session.items).toHaveLength(8);
    await gradeAll(f.deps, s3.session, 8);
    expect((await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' })).outcome).toBe('ended');
    const s4 = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (s4.outcome !== 'started') throw new Error('s4 failed');
    expect(s4.session.items).toHaveLength(1);
  });

  it('3) 후보 10개 이하는 전체 시작한다', async () => {
    for (const n of [1, 7, 8]) {
      const f = fakes(n, n + 1);
      const r = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
      expect(r.outcome).toBe('started');
      if (r.outcome === 'started') expect(r.session.items).toHaveLength(n);
    }
  });

  it('4) 회차 중 추가는 다음 plan에 append되고 제거는 빠진다', async () => {
    const f = fakes(12, 21);
    const s1 = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (s1.outcome !== 'started') throw new Error('s1 failed');
    expect(s1.session.items).toHaveLength(8);
    await gradeAll(f.deps, s1.session, 8);
    expect((await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' })).outcome).toBe('ended');
    f.src.state.wrong.push({ ...makeCandidates(1)[0], questionId: 'rq-new' });
    f.src.state.wrong = f.src.state.wrong.filter((c) => c.questionId !== 'rq-0');
    const s2 = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (s2.outcome !== 'started') throw new Error('s2 failed');
    const ids2 = s2.session.items.map((i) => i.questionId);
    expect(ids2).toContain('rq-new');
    expect(ids2).not.toContain('rq-0');
  });

  it('5) early end 미채점 3은 remaining에 복귀한다', async () => {
    const f = fakes(12, 31);
    const s1 = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (s1.outcome !== 'started') throw new Error('s1 failed');
    await gradeAll(f.deps, s1.session, 5);
    const ended = await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(ended.outcome).toBe('ended');
    if (ended.outcome === 'ended') expect(ended.summary).toMatchObject({ total: 8, graded: 5, pending: 3 });
    const s2 = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (s2.outcome !== 'started') throw new Error('s2 failed');
    const pendingIds = ended.outcome === 'ended' ? ended.session.items.filter((i) => i.state.kind === 'pending').map((i) => i.questionId) : [];
    expect(pendingIds).toHaveLength(3);
    for (const pid of pendingIds) expect(s2.session.cycleQuestionIds).toContain(pid);
  });

  it('6) resume·소유권·시험 격리·bookmark 회귀', async () => {
    const f = fakes(12, 41);
    const s1 = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (s1.outcome !== 'started') throw new Error('s1 failed');
    const resumed = await resumeReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(resumed.outcome).toBe('resumed');
    if (resumed.outcome === 'resumed') {
      expect(resumed.session.id).toBe(s1.session.id);
      expect(resumed.session.items.map((i) => i.questionId)).toEqual(s1.session.items.map((i) => i.questionId));
    }
    expect(await resumeReviewSession(f.deps, { userId: 'u2', examId: 'saa-c03', mode: 'wrong' })).toEqual({ outcome: 'none' });
    expect(await resumeReviewSession(f.deps, { userId: 'u1', examId: 'other', mode: 'wrong' })).toEqual({ outcome: 'none' });
    expect(await resumeReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark' })).toEqual({ outcome: 'none' });
    const bm = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark' });
    expect(bm.outcome).toBe('started');
  });

  it('7) legacy active all-graded end는 queue를 비워 다음 plan이 current-items를 탄다', async () => {
    const f = fakes(5, 51);
    const subset = f.src.state.wrong.slice(0, 3);
    const legacy = buildReviewSession({
      id: 'legacy-all',
      userId: 'u1',
      examId: 'saa-c03',
      mode: 'wrong',
      candidates: subset,
      createdAt: 1700000000,
      rng: () => f.deps.rng.next(),
    });
    expect(legacy.remainingQuestionIds ?? null).toBeNull();
    await f.repo.repository.save({ session: legacy });
    await gradeAll(f.deps, legacy, 3);
    const ended = await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(ended.outcome).toBe('ended');
    if (ended.outcome !== 'ended') throw new Error('legacy end failed');
    expect(ended.session.remainingQuestionIds ?? null).toBeNull();
    expect(ended.session.cycleQuestionIds ?? null).toBeNull();
    const view = await getReviewCandidatesView(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(view.total).toBe(2);
    const next = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (next.outcome !== 'started') throw new Error('next failed');
    expect(next.session.items).toHaveLength(2);
  });

  it('8) legacy active early-end pending은 pending+rest로 다음 plan에 잡힌다', async () => {
    const f = fakes(5, 52);
    const subset = f.src.state.wrong.slice(0, 3);
    const legacy = buildReviewSession({
      id: 'legacy-early',
      userId: 'u1',
      examId: 'saa-c03',
      mode: 'wrong',
      candidates: subset,
      createdAt: 1700000000,
      rng: () => f.deps.rng.next(),
    });
    await f.repo.repository.save({ session: legacy });
    const stored = await f.repo.repository.findActive({ userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    if (!stored) throw new Error('legacy active missing');
    await gradeAll(f.deps, stored, 1);
    const ended = await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(ended.outcome).toBe('ended');
    if (ended.outcome !== 'ended') throw new Error('legacy early end failed');
    expect(ended.summary).toMatchObject({ total: 3, graded: 1, pending: 2 });
    expect(ended.session.remainingQuestionIds).toHaveLength(2);
    expect(ended.session.cycleQuestionIds).toHaveLength(3);
    const view = await getReviewCandidatesView(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(view.total).toBe(4);
    const next = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    if (next.outcome !== 'started') throw new Error('next failed');
    expect(next.session.items).toHaveLength(4);
    const pendingIds = ended.session.items.filter((i) => i.state.kind === 'pending').map((i) => i.questionId);
    for (const pid of pendingIds) expect(next.session.items.map((i) => i.questionId)).toContain(pid);
  });
});
