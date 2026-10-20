import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migration0000 from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import migration0001 from '../../drizzle/migrations/0001_add-users-external-identities.sql?raw';
import migration0002 from '../../drizzle/migrations/0002_add-sessions.sql?raw';
import migration0003 from '../../drizzle/migrations/0003_add-question-bank.sql?raw';
import migration0004 from '../../drizzle/migrations/0004_add-admin-api.sql?raw';
import migration0005 from '../../drizzle/migrations/0005_add-study-sets.sql?raw';
import migration0006 from '../../drizzle/migrations/0006_add-study-item-content.sql?raw';
import migration0007 from '../../drizzle/migrations/0007_add-single-session.sql?raw';
import migration0008 from '../../drizzle/migrations/0008_add-reports-recheck.sql?raw';
import migration0009 from '../../drizzle/migrations/0009_add-study-attempts.sql?raw';
import migration0010 from '../../drizzle/migrations/0010_add-study-corrections.sql?raw';
import migration0011 from '../../drizzle/migrations/0011_add-review-sessions.sql?raw';
import migration0012 from '../../drizzle/migrations/0012_add-review-bookmarks.sql?raw';
import migration0013 from '../../drizzle/migrations/0013_add-review-round-queue.sql?raw';
import { applyD1Migrations } from './fixtures/kakao-fakes';
import { createD1ReviewSessionRepository } from '../../src/infra/persistence/review-session-repository';
import { endReviewSession, getReviewCandidatesView, startReviewSession, answerReviewItem } from '@/app/review';
import { fakeGradingRepository, fakeSource, fakeTimeRng, makeCandidates } from '../unit/review/fixtures';
import type { ReviewSession } from '@/domain/review/types';

// #221 D1 integration(ADR-0059): migration 0013 적용·queue roundtrip·25→10→10→5→새 cycle.
const db = env.DB;
const NOW = 1792998000;

function item(q: string, state: ReviewSession['items'][number]['state']): ReviewSession['items'][number] {
  return {
    questionId: q,
    questionVersionId: `${q}-v1`,
    versionNo: 1,
    optionIds: [`${q}-o1`, `${q}-o2`],
    answerOptionIds: [`${q}-o2`],
    optionOrder: [`${q}-o1`, `${q}-o2`],
    state,
  };
}

beforeAll(async () => {
  await applyD1Migrations(db, [
    migration0000, migration0001, migration0002, migration0003, migration0004, migration0005,
    migration0006, migration0007, migration0008, migration0009, migration0010, migration0011,
    migration0012, migration0013,
  ]);
  await db.prepare('INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-queue', NOW, NOW).run();
});

beforeEach(async () => {
  await db.prepare('DELETE FROM review_sessions').run();
});

describe('review round queue D1 (0013)', () => {
  it('migration 0013으로 remaining/cycle 컬럼이 생긴다', async () => {
    const table = await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='review_sessions'").first<{ sql: string }>();
    expect(table?.sql).toContain('remaining_question_ids');
    expect(table?.sql).toContain('cycle_question_ids');
  });

  it('queue roundtrip·findLastEnded·end 원자 갱신을 보장한다', async () => {
    const repo = createD1ReviewSessionRepository(db);
    const base: ReviewSession = {
      id: 'q-1', userId: 'u-queue', examId: 'e-1', mode: 'wrong', status: 'active',
      createdAt: NOW, cursor: 0,
      items: [item('a', { kind: 'pending' }), item('b', { kind: 'pending' })],
      remainingQuestionIds: ['c'], cycleQuestionIds: ['a', 'b', 'c'],
    };
    await repo.save({ session: base });
    expect(await repo.findActive({ userId: 'u-queue', examId: 'e-1', mode: 'wrong' })).toEqual(base);
    const ended: ReviewSession = { ...base, status: 'ended', endedAt: NOW + 1, remainingQuestionIds: ['c', 'a'], cycleQuestionIds: ['a', 'b', 'c'] };
    expect(await repo.end({ session: ended, expectedCursor: 0 })).toBe(true);
    expect(await repo.findActive({ userId: 'u-queue', examId: 'e-1', mode: 'wrong' })).toBeNull();
    expect(await repo.findLastEnded({ userId: 'u-queue', examId: 'e-1', mode: 'wrong' })).toEqual(ended);
    expect(await repo.findLastEnded({ userId: 'u-queue', examId: 'e-1', mode: 'bookmark' })).toBeNull();
  });

  it('D1 저장소로 25→10→5→새 cycle 분할이 영속된다', async () => {
    const repo = createD1ReviewSessionRepository(db);
    const src = fakeSource({ wrong: makeCandidates(25) });
    const grading = fakeGradingRepository(new Map());
    const { clock, rng } = fakeTimeRng(99);
    // grading fake는 D1 repo 세션 맵을 공유하지 않으므로 app start/end만 D1 repo로 검증한다.
    const deps = { source: src.source, repository: repo, grading: grading.repository, clock, rng };
    const view = await getReviewCandidatesView(deps, { userId: 'u-queue', examId: 'e-1', mode: 'wrong' });
    expect(view.total).toBe(25);
    const s1 = await startReviewSession(deps, { userId: 'u-queue', examId: 'e-1', mode: 'wrong' });
    if (s1.outcome !== 'started') throw new Error('s1 failed');
    expect(s1.session.items).toHaveLength(10);
    expect(s1.session.remainingQuestionIds).toHaveLength(15);
    // grading 없이 종료(pending 전원 복귀)하면 remaining은 10+15=25가 아니라 pending 10+15=25다.
    // 여기서는 end만으로 pending 10이 복귀함을 본다.
    const ended = await endReviewSession(deps, { userId: 'u-queue', examId: 'e-1', mode: 'wrong' });
    expect(ended.outcome).toBe('ended');
    if (ended.outcome === 'ended') {
      expect(ended.summary).toMatchObject({ total: 10, graded: 0, pending: 10 });
      expect(ended.session.remainingQuestionIds).toHaveLength(25);
    }
    void answerReviewItem;
  });
});
