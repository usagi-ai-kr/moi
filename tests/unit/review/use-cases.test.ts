import { describe, expect, it } from 'vitest';
import {
  answerReviewItem,
  endReviewSession,
  isSessionExhausted,
  resumeReviewSession,
  startReviewSession,
  toggleBookmark,
} from '@/app/review';
import type { ReviewSession } from '@/domain/review/types';
import type { ReviewGradingRepository } from '@/app/review/grading-ports';
import { fakeGradingRepository, fakeRepository, fakeSource, fakeTimeRng, makeCandidate, makeCandidates } from './fixtures';

// 이슈 #51 use case — Start/Answer/End/Resume/ToggleBookmark fake port 단위 테스트.
// 채점은 원자 Port 필수주입(#54) — 순차 save+recordBatch fallback 금지.

function fakes(input?: { wrong?: ReturnType<typeof makeCandidates>; bookmarked?: ReturnType<typeof makeCandidates>; seed?: number }) {
  const src = fakeSource({ wrong: input?.wrong, bookmarked: input?.bookmarked });
  const repo = fakeRepository();
  const grading = fakeGradingRepository(repo.sessions);
  const { clock, rng } = fakeTimeRng(input?.seed ?? 123);
  const deps = { source: src.source, repository: repo.repository, grading: grading.repository, clock, rng };
  return { deps, src, repo, grading };
}

function current(session: ReviewSession): string {
  return session.items[session.cursor]?.questionId ?? '';
}

describe('StartReviewSession (모드별 독립 회차·스냅샷)', () => {
  it('Given 오답 3·Pass 1·미응답 1 When wrong 복습 시작 Then 5문제·가중치 적용', async () => {
    // Pass·미응답 제출도 유효 오답으로 계수된다고 가정한 소스(오답 3, Pass 1, 미응답 1 → 5문제).
    const f = fakes({ wrong: makeCandidates(5, { 0: 3, 1: 1, 2: 1, 3: 1, 4: 1 }) });
    const result = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', size: 8 });
    expect(result.outcome).toBe('started');
    if (result.outcome === 'started') {
      expect(result.session.items).toHaveLength(5);
      expect(result.session.mode).toBe('wrong');
      expect(result.session.cursor).toBe(0);
      expect(new Set(result.session.items.map((i) => i.questionId)).size).toBe(5);
      expect(f.src.calls.wrong).toBe(1);
      expect(f.src.calls.bookmarked).toBe(0);
    }
  });

  it('Given 북마크 5 When bookmark 복습 Then 균등 5문제', async () => {
    const f = fakes({ bookmarked: makeCandidates(5, { 0: 9, 2: 2 }) });
    const result = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark', size: 8 });
    expect(result.outcome).toBe('started');
    if (result.outcome === 'started') {
      expect(result.session.items).toHaveLength(5);
      expect(f.src.calls.bookmarked).toBe(1);
      expect(f.src.calls.wrong).toBe(0);
    }
  });

  it('활성 회차가 있으면 시작 거부(이어풀기 안내)', async () => {
    const f = fakes({ wrong: makeCandidates(3) });
    await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    const second = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(second).toMatchObject({ outcome: 'rejected', reason: 'active_session_exists' });
  });

  it('모드는 독립 — wrong 활성 회차가 있어도 bookmark 회차를 시작할 수 있다', async () => {
    const f = fakes({ wrong: makeCandidates(3), bookmarked: makeCandidates(3) });
    await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    const bookmark = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark' });
    expect(bookmark.outcome).toBe('started');
  });

  it('경계 — 대상 0이면 시작 거부', async () => {
    const f = fakes({ wrong: [] });
    const result = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(result).toMatchObject({ outcome: 'rejected', reason: 'no_candidates' });
    expect(await f.repo.repository.findActive({ userId: 'u1', examId: 'saa-c03', mode: 'wrong' })).toBeNull();
  });
});

describe('AnswerReviewItem (즉시 채점·이력 보존)', () => {
  async function started(mode: 'wrong' | 'bookmark' = 'wrong') {
    const f = fakes({ wrong: makeCandidates(3, { 0: 2 }), bookmarked: makeCandidates(3) });
    const result = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode });
    return { f, session: (result as { session: ReviewSession }).session };
  }

  it('채점 즉시 반영되고 시도 이력이 저장소에 보존된다', async () => {
    const { f, session } = await started();
    const qid = current(session);
    const ok = await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: qid, response: { kind: 'answered', optionIds: ['b'] } });
    expect(ok).toMatchObject({ outcome: 'answered', correct: true });
    if (ok.outcome === 'answered') {
      expect(ok.attempt).toMatchObject({ questionId: qid, correct: true, answeredAt: 1700000000 });
      expect(ok.session.cursor).toBe(1);
    }
    const saved = await f.repo.repository.findActive({ userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(saved?.cursor).toBe(1);
    expect(saved?.items[0]?.state.kind).toBe('graded');
  });

  it('Pass는 오답으로 즉시 채점된다', async () => {
    const { f, session } = await started();
    const result = await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: current(session), response: { kind: 'pass' } });
    expect(result).toMatchObject({ outcome: 'answered', correct: false });
  });

  it('다른 사용자/시험 접근 금지', async () => {
    const { f, session } = await started();
    const wrongUser = await answerReviewItem(f.deps, { userId: 'u2', examId: 'saa-c03', mode: 'wrong', questionId: current(session), response: { kind: 'pass' } });
    expect(wrongUser).toMatchObject({ outcome: 'rejected', reason: 'not_found' });
    const wrongExam = await answerReviewItem(f.deps, { userId: 'u1', examId: 'clp-c02', mode: 'wrong', questionId: current(session), response: { kind: 'pass' } });
    expect(wrongExam).toMatchObject({ outcome: 'rejected', reason: 'not_found' });
  });

  it('알 수 없는 보기·순서 밖 문제는 거부된다', async () => {
    const { f, session } = await started();
    const unknown = await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: current(session), response: { kind: 'answered', optionIds: ['zzz'] } });
    expect(unknown).toMatchObject({ outcome: 'rejected', reason: 'unknown_option' });
    const outOfOrder = await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: session.items[2]?.questionId ?? '', response: { kind: 'pass' } });
    expect(outOfOrder).toMatchObject({ outcome: 'rejected', reason: 'not_current' });
  });
});

describe('EndReviewSession·Resume (종료·이어풀기)', () => {
  it('Given 회차 이어풀기 When 재방문 Then 같은 대상·순서', async () => {
    const f = fakes({ wrong: makeCandidates(4, { 0: 3 }) });
    const started = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    const session = (started as { session: ReviewSession }).session;
    await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: current(session), response: { kind: 'answered', optionIds: ['b'] } });

    const resumed = await resumeReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(resumed.outcome).toBe('resumed');
    if (resumed.outcome === 'resumed') {
      expect(resumed.session.id).toBe(session.id);
      expect(resumed.session.items.map((i) => i.questionId)).toEqual(session.items.map((i) => i.questionId));
      expect(resumed.session.items.map((i) => i.optionOrder)).toEqual(session.items.map((i) => i.optionOrder));
      expect(resumed.session.cursor).toBe(1);
    }
    // 다른 모드·다른 사용자는 이어풀기 대상이 아니다.
    expect(await resumeReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark' })).toEqual({ outcome: 'none' });
    expect(await resumeReviewSession(f.deps, { userId: 'u2', examId: 'saa-c03', mode: 'wrong' })).toEqual({ outcome: 'none' });
  });

  it('종료 후 채점·재종료 거부, 미채점은 오답 처리하지 않는다', async () => {
    const f = fakes({ wrong: makeCandidates(3, { 1: 2 }) });
    const started = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    const session = (started as { session: ReviewSession }).session;
    await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: current(session), response: { kind: 'answered', optionIds: ['a'] } });

    const ended = await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(ended.outcome).toBe('ended');
    if (ended.outcome === 'ended') {
      expect(ended.session.status).toBe('ended');
      expect(ended.summary).toMatchObject({ total: 3, graded: 1, pending: 2, correct: 0 });
    }
    const afterEnd = await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: ended.outcome === 'ended' ? ended.session.items[1]?.questionId ?? '' : '', response: { kind: 'pass' } });
    expect(afterEnd).toMatchObject({ outcome: 'rejected', reason: 'not_found' });
    const reEnd = await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(reEnd).toMatchObject({ outcome: 'rejected', reason: 'not_found' });
  });

  it('종료 후 새 회차를 시작할 수 있다', async () => {
    const f = fakes({ wrong: makeCandidates(2) });
    await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    const next = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(next.outcome).toBe('started');
  });

  it('소진된 회차를 재방문하면 이어풀기로 소진 상태를 알린다', async () => {
    const f = fakes({ wrong: makeCandidates(2) });
    const started = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    let session = (started as { session: ReviewSession }).session;
    for (let i = 0; i < 2; i += 1) {
      const answered = await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: current(session), response: { kind: 'answered', optionIds: ['b'] } });
      if (answered.outcome === 'answered') session = answered.session;
    }
    expect(isSessionExhausted(session)).toBe(true);
    const resumed = await resumeReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(resumed.outcome).toBe('resumed');
    if (resumed.outcome === 'resumed') expect(isSessionExhausted(resumed.session)).toBe(true);
  });
});

describe('대상 증감·소진 (다음 회차부터 반영)', () => {
  it('Given 회차 중 북마크 추가 When 회차 조회 Then 다음 회차부터 반영', async () => {
    const f = fakes({ bookmarked: makeCandidates(5) });
    const started = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark', size: 8 });
    const session = (started as { session: ReviewSession }).session;
    expect(session.items).toHaveLength(5);

    const toggled = await toggleBookmark(f.deps, { userId: 'u1', questionId: 'new-q' });
    expect(toggled).toEqual({ bookmarked: true });

    // 진행 중 회차는 스냅샷 그대로(다음 회차부터 반영).
    const resumed = await resumeReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark' });
    if (resumed.outcome === 'resumed') {
      expect(resumed.session.items).toHaveLength(5);
      expect(resumed.session.items.map((i) => i.questionId)).not.toContain('new-q');
    }

    // 종료 후 새 회차는 최신 목록(6문제)을 반영한다.
    await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark' });
    const next = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark', size: 8 });
    if (next.outcome === 'started') {
      expect(next.session.items).toHaveLength(6);
      expect(next.session.items.map((i) => i.questionId)).toContain('new-q');
    }
  });

  it('Given 대상 소진 When 다음 회차 Then 최신 목록을 다시 섞는다', async () => {
    const f = fakes({ wrong: makeCandidates(2, { 0: 3 }) });
    const started = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    let session = (started as { session: ReviewSession }).session;
    const firstOrder = session.items.map((i) => i.questionId);
    for (let i = 0; i < 2; i += 1) {
      const answered = await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: current(session), response: { kind: 'answered', optionIds: ['b'] } });
      if (answered.outcome === 'answered') session = answered.session;
    }
    await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });

    // 소스가 최신 상태로 바뀐다(새 오답 1건 반영).
    f.src.state.wrong.push(makeCandidate({ questionId: 'fresh-q', validWrongCount: 4 }));
    const next = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(next.outcome).toBe('started');
    if (next.outcome === 'started') {
      expect(next.session.items).toHaveLength(3);
      expect(next.session.items.map((i) => i.questionId)).toContain('fresh-q');
      expect(next.session.id).not.toBe(session.id);
      expect(f.src.calls.wrong).toBe(2); // 소진 후 다음 회차는 소스를 다시 조회한다
      expect(firstOrder).toHaveLength(2);
    }
  });

  it('북마크 해제도 다음 회차부터 반영된다', async () => {
    const f = fakes({ bookmarked: makeCandidates(3) });
    await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark' });
    await toggleBookmark(f.deps, { userId: 'u1', questionId: 'rq-1' });
    await endReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark' });
    const next = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'bookmark' });
    if (next.outcome === 'started') {
      expect(next.session.items).toHaveLength(2);
      expect(next.session.items.map((i) => i.questionId)).not.toContain('rq-1');
    }
  });

  it('소스 후보 개정 스냅샷이 회차 중 바뀌어도 채점은 시작 시점 개정으로 한다', async () => {
    const candidate = makeCandidate({ questionId: 'rq-live', validWrongCount: 2, version: { questionVersionId: 'rqv-live-v1', versionNo: 1, optionIds: ['a', 'b'], answerOptionIds: ['b'] } });
    const f = fakes({ wrong: [candidate] });
    const started = await startReviewSession(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    if (started.outcome === 'started') {
      // 시작 시점 개정(v1·정답 b)이 스냅샷으로 고정된다.
      expect(started.session.items[0]?.questionVersionId).toBe('rqv-live-v1');
      expect(started.session.items[0]?.answerOptionIds).toEqual(['b']);
    }
    // 소스의 정답 개정이 바뀌어도 회차 스냅샷의 정답으로 채점한다.
    f.src.state.wrong = [makeCandidate({ questionId: 'rq-live', validWrongCount: 2, version: { questionVersionId: 'rqv-live-v2', versionNo: 2, optionIds: ['a', 'b'], answerOptionIds: ['a'] } })];
    const answered = await answerReviewItem(f.deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: 'rq-live', response: { kind: 'answered', optionIds: ['b'] } });
    expect(answered).toMatchObject({ outcome: 'answered', correct: true });
    if (answered.outcome === 'answered') expect(answered.attempt.questionVersionId).toBe('rqv-live-v1');
  });
});

describe('AnswerReviewItem → 원자 저장 (이슈 #54, 필수주입)', () => {
  async function startedWithGrading(seed: readonly { userId: string; examId: string; questionId: string; questionVersionId: string; outcome: 'correct' | 'wrong' | 'pass'; occurredAt: number; attemptId: string }[] = []) {
    const src = fakeSource({ wrong: makeCandidates(3, { 0: 2 }) });
    const repo = fakeRepository();
    const grading = fakeGradingRepository(repo.sessions, seed);
    const { clock, rng } = fakeTimeRng(123);
    const deps = { source: src.source, repository: repo.repository, grading: grading.repository, clock, rng };
    const result = await startReviewSession(deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    return { deps, grading, repo, session: (result as { session: ReviewSession }).session };
  }

  it('Given 이력 없음 When 정답 채점 Then 원자 commit 1건·cursor+1·firstAttempt true', async () => {
    const { deps, grading, session } = await startedWithGrading();
    const item = session.items[session.cursor];
    const qid = item?.questionId ?? '';
    const ok = await answerReviewItem(deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: qid, response: { kind: 'answered', optionIds: ['b'] } });
    expect(ok.outcome).toBe('answered');
    expect(grading.calls.commit).toBe(1);
    const record = grading.attempts.get(`${session.id}:${qid}`);
    expect(record).toMatchObject({
      userId: 'u1',
      examId: 'saa-c03',
      questionId: qid,
      questionVersionId: item?.questionVersionId,
      outcome: 'correct',
      occurredAt: 1700000000000,
      firstAttempt: true,
    });
    if (ok.outcome === 'answered') expect(ok.session.cursor).toBe(1);
  });

  it('Pass는 outcome pass·firstAttempt false, 오답은 outcome wrong·firstAttempt true', async () => {
    const { deps, grading, session } = await startedWithGrading();
    const first = session.items[session.cursor]?.questionId ?? '';
    await answerReviewItem(deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: first, response: { kind: 'pass' } });
    const resumed = await deps.repository.findActive({ userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    const second = resumed?.items[resumed.cursor]?.questionId ?? '';
    await answerReviewItem(deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: second, response: { kind: 'answered', optionIds: ['a'] } });
    expect(grading.attempts.size).toBe(2);
    expect([...grading.attempts.values()][0]).toMatchObject({ questionId: first, outcome: 'pass', firstAttempt: false });
    expect([...grading.attempts.values()][1]).toMatchObject({ questionId: second, outcome: 'wrong', firstAttempt: true });
  });

  it('Given 이전 wrong 시도 When 정답 채점 Then firstAttempt false', async () => {
    const src = fakeSource({ wrong: makeCandidates(3, { 0: 2 }) });
    const repo = fakeRepository();
    const { clock, rng } = fakeTimeRng(123);
    const bootstrap = fakeGradingRepository(repo.sessions);
    const bootDeps = { source: src.source, repository: repo.repository, grading: bootstrap.repository, clock, rng };
    const started = await startReviewSession(bootDeps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    const session = (started as { session: ReviewSession }).session;
    const qid = session.items[session.cursor]?.questionId ?? '';
    const versionId = session.items[session.cursor]?.questionVersionId ?? '';
    const withPrior = fakeGradingRepository(repo.sessions, [
      { userId: 'u1', examId: 'saa-c03', questionId: qid, questionVersionId: versionId, outcome: 'wrong', occurredAt: 1600000000000, attemptId: 'seed:target' },
    ]);
    // 세션은 repo.sessions에 이미 저장돼 있으므로 새 grading과 공유된다
    const deps2 = { source: src.source, repository: repo.repository, grading: withPrior.repository, clock, rng };
    const result = await answerReviewItem(deps2, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: qid, response: { kind: 'answered', optionIds: ['b'] } });
    expect(result.outcome).toBe('answered');
    expect(withPrior.attempts.get(`${session.id}:${qid}`)).toMatchObject({ firstAttempt: false });
  });

  it('commit false면 conflict·쓰기 없음(롤백) — cursor 유지·attempt 0건', async () => {
    const src = fakeSource({ wrong: makeCandidates(2) });
    const repo = fakeRepository();
    const { clock, rng } = fakeTimeRng(123);
    const started = await startReviewSession(
      { source: src.source, repository: repo.repository, grading: fakeGradingRepository(repo.sessions).repository, clock, rng },
      { userId: 'u1', examId: 'saa-c03', mode: 'wrong' },
    );
    const session = (started as { session: ReviewSession }).session;
    const failing: ReviewGradingRepository = {
      async commit() {
        return false;
      },
    };
    const deps = {
      source: src.source,
      repository: repo.repository,
      grading: failing,
      clock,
      rng,
    };
    const qid = session.items[session.cursor]?.questionId ?? '';
    const result = await answerReviewItem(deps, { userId: 'u1', examId: 'saa-c03', mode: 'wrong', questionId: qid, response: { kind: 'answered', optionIds: ['b'] } });
    expect(result).toMatchObject({ outcome: 'rejected', reason: 'conflict' });
    const stored = await repo.repository.findActive({ userId: 'u1', examId: 'saa-c03', mode: 'wrong' });
    expect(stored?.cursor).toBe(0);
    expect(stored?.items[0]?.state.kind).toBe('pending');
  });

  it('동일 cursor 동시 채점 경합은 1건만 answered·나머지 conflict', async () => {
    const { deps, session } = await startedWithGrading();
    const qid = session.items[session.cursor]?.questionId ?? '';
    const input = { userId: 'u1', examId: 'saa-c03', mode: 'wrong' as const, questionId: qid, response: { kind: 'pass' as const } };
    const [a, b] = await Promise.all([answerReviewItem(deps, input), answerReviewItem(deps, input)]);
    expect([a.outcome, b.outcome].filter((o) => o === 'answered')).toHaveLength(1);
    expect([a, b].filter((r) => r.outcome === 'rejected')).toHaveLength(1);
  });
});
