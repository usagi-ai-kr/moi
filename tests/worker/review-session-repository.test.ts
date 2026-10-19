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
import { applyD1Migrations } from './fixtures/kakao-fakes';
import { createD1ReviewSessionRepository } from '../../src/infra/persistence/review-session-repository';
import type { ReviewSession } from '@/domain/review/types';

// 이슈 #54/#51 ReviewSessionRepository D1 어댑터(ADR-0020/0027) — roundtrip·격리·활성 1개·금지 전이를 증명한다.
const db = env.DB;
const NOW = 1792998000;
const repo = createD1ReviewSessionRepository(db);

function item(q: string, state: ReviewSession['items'][number]['state']): ReviewSession['items'][number] {
  return {
    questionId: q,
    questionVersionId: `${q}-v1`,
    versionNo: 1,
    optionIds: [`${q}-o1`, `${q}-o2`, `${q}-o3`, `${q}-o4`],
    answerOptionIds: [`${q}-o2`, `${q}-o4`],
    optionOrder: [`${q}-o3`, `${q}-o1`, `${q}-o2`, `${q}-o4`],
    state,
  };
}

function session(over: Partial<ReviewSession> = {}): ReviewSession {
  return {
    id: 'rs-1',
    userId: 'u-1',
    examId: 'e-1',
    mode: 'wrong',
    status: 'active',
    createdAt: NOW,
    cursor: 2,
    items: [
      item('q-1', { kind: 'graded', response: { kind: 'answered', optionIds: ['q-1-o2', 'q-1-o4'] }, correct: true, gradedAt: NOW + 30 }),
      item('q-2', { kind: 'graded', response: { kind: 'pass' }, correct: false, gradedAt: NOW + 60 }),
      item('q-3', { kind: 'pending' }),
    ],
    ...over,
  };
}

let userSeed = false;
async function seedUserOnce(): Promise<void> {
  if (userSeed) return;
  userSeed = true;
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-2', NOW, NOW).run();
}

beforeAll(async () => {
  await applyD1Migrations(db, [
    migration0000,
    migration0001,
    migration0002,
    migration0003,
    migration0004,
    migration0005,
    migration0006,
    migration0007,
    migration0008,
    migration0009,
    migration0010,
    migration0011,
  ]);
  await seedUserOnce();
});

beforeEach(async () => {
  await db.prepare('DELETE FROM review_sessions').run();
});

describe('ReviewSessionRepository D1 어댑터', () => {
  it('save→findActive roundtrip: items·보기/정답·채점상태·cursor·createdAt을 원본 그대로 복원한다', async () => {
    const s = session();
    await repo.save({ session: s });
    const loaded = await repo.findActive({ userId: 'u-1', examId: 'e-1', mode: 'wrong' });
    expect(loaded).toEqual(s);
  });

  it('endedAt을 저장·복원하고 종료 후 같은 (user, exam, mode) 활성 회차를 다시 시작할 수 있다', async () => {
    await repo.save({ session: session() });
    await repo.save({ session: session({ status: 'ended', endedAt: NOW + 500 }) });
    const ended = await repo.findActive({ userId: 'u-1', examId: 'e-1', mode: 'wrong' });
    expect(ended).toBeNull();
    // 부분 UNIQUE가 해제되어 새 활성 회차 시작 가능 (종료 → 신규)
    const next = session({ id: 'rs-2', cursor: 0 });
    await repo.save({ session: next });
    const loaded = await repo.findActive({ userId: 'u-1', examId: 'e-1', mode: 'wrong' });
    expect(loaded?.id).toBe('rs-2');
  });

  it('userId/examId/mode 격리 — 다른 축에서 findActive는 null을 돌려준다', async () => {
    await repo.save({ session: session() });
    expect(await repo.findActive({ userId: 'u-2', examId: 'e-1', mode: 'wrong' })).toBeNull();
    expect(await repo.findActive({ userId: 'u-1', examId: 'e-2', mode: 'wrong' })).toBeNull();
    expect(await repo.findActive({ userId: 'u-1', examId: 'e-1', mode: 'bookmark' })).toBeNull();
  });

  it('활성 회차는 (userId, examId, mode)당 1개 — 다른 id 활성 저장은 거부하고 기존 회차를 유지한다', async () => {
    await repo.save({ session: session() });
    await expect(repo.save({ session: session({ id: 'rs-crash' }) })).rejects.toThrow();
    const row = await db.prepare("SELECT COUNT(*) AS c FROM review_sessions WHERE status = 'active'").first<{ c: number }>();
    expect(row?.c).toBe(1);
  });

  it('다른 회차 덮어쓰기·소유자 변경 금지 — save가 거부하고 기존 행을 변경하지 않는다', async () => {
    await repo.save({ session: session() });
    const before = await db
      .prepare('SELECT user_id, cursor, items FROM review_sessions WHERE id = ?1')
      .bind('rs-1')
      .first<{ user_id: string; cursor: number; items: string }>();
    // 다른 userId의 회차 저장(replace 시도)
    await expect(repo.save({ session: session({ userId: 'u-2', cursor: 9 }) })).rejects.toThrow();
    // 같은 id로 다른 userId 저장(소유자 변경 시도)
    await expect(repo.save({ session: session({ userId: 'u-2' }) })).rejects.toThrow();
    const after = await db
      .prepare('SELECT user_id, cursor, items FROM review_sessions WHERE id = ?1')
      .bind('rs-1')
      .first<{ user_id: string; cursor: number; items: string }>();
    expect(after).toEqual(before);
  });

  it('종료 회차 부활 금지 — ended 이후 활성 복원 save는 거부한다', async () => {
    await repo.save({ session: session() });
    await repo.save({ session: session({ status: 'ended', endedAt: NOW + 500 }) });
    await expect(repo.save({ session: session({ cursor: 7 }) })).rejects.toThrow();
    const row = await db.prepare('SELECT status FROM review_sessions WHERE id = ?1').bind('rs-1').first<{ status: string }>();
    expect(row?.status).toBe('ended');
  });

  it('종료 회차는 동일 스냅샷 재저장만 허용하고 이력 수정 저장은 거부한다', async () => {
    await repo.save({ session: session() });
    const ended = session({ status: 'ended', endedAt: NOW + 500 });
    await repo.save({ session: ended });
    // 동일 스냅샷 재저장 — 멱등 허용(채점 이력 불변)
    await repo.save({ session: ended });
    // cursor·items 등 이력 수정 시도 — 거부
    await expect(repo.save({ session: session({ status: 'ended', endedAt: NOW + 500, cursor: 7 }) })).rejects.toThrow();
    await expect(
      repo.save({ session: session({ status: 'ended', endedAt: NOW + 500, items: [item('q-1', { kind: 'pending' })] }) }),
    ).rejects.toThrow();
    const row = await db
      .prepare('SELECT status, cursor, items FROM review_sessions WHERE id = ?1')
      .bind('rs-1')
      .first<{ status: string; cursor: number; items: string }>();
    expect(row?.cursor).toBe(2);
    expect(JSON.parse(row?.items ?? '[]')).toHaveLength(3);
  });
});
