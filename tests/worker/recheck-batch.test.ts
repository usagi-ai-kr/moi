import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runRecheckBatch } from '@/app/reports/recheck-batch';
import type { RecheckRepository, ReviewerPort } from '@/app/reports/recheck-port';
import { RETRY_DELAY_MS } from '@/domain/reports/thresholds';
import { createD1RecheckRepository } from '@/infra/persistence/recheck-repository';
import migration0000 from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import migration0001 from '../../drizzle/migrations/0001_add-users-external-identities.sql?raw';
import migration0002 from '../../drizzle/migrations/0002_add-sessions.sql?raw';
import migration0003 from '../../drizzle/migrations/0003_add-question-bank.sql?raw';
import migration0004 from '../../drizzle/migrations/0004_add-admin-api.sql?raw';
import migration0005 from '../../drizzle/migrations/0005_add-study-sets.sql?raw';
import migration0006 from '../../drizzle/migrations/0006_add-study-item-content.sql?raw';
import migration0007 from '../../drizzle/migrations/0007_add-single-session.sql?raw';
import migration0008 from '../../drizzle/migrations/0008_add-reports-recheck.sql?raw';
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #53 Cron 재검수 배치 — start → reviewer → finish 실행을 증명한다.
const db = env.DB;
const NOW = 1700000000000;

async function seedBase(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  await db
    .prepare("INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES ('q-1', 'e-1', 'd-1', 'active', ?1, ?1)")
    .bind(NOW)
    .run();
  for (const [id, no] of [['qv-1', 1], ['qv-2', 2]] as const) {
    await db
      .prepare(
        "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, 'q-1', ?2, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?3)",
      )
      .bind(id, no, NOW)
      .run();
  }
}

async function seedQueue(
  versionId: string,
  input: { status?: string; attempts?: number; lastAttemptAt?: number | null; startedAt?: number | null; updatedAt?: number } = {},
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO question_recheck_queue (question_version_id, status, attempts, last_attempt_at, started_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    )
    .bind(
      versionId,
      input.status ?? 'queued',
      input.attempts ?? 0,
      input.lastAttemptAt ?? null,
      input.startedAt ?? null,
      input.updatedAt ?? NOW,
    )
    .run();
}

function fakeReviewer(outcomes: Record<string, 'succeeded' | 'failed'>): ReviewerPort {
  return {
    async review({ versionId }) {
      return { outcome: outcomes[versionId] ?? 'succeeded' };
    },
  };
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008]);
});

beforeEach(async () => {
  for (const t of ['question_recheck_queue', 'question_reports', 'study_set_items', 'study_sets', 'question_versions', 'questions']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  for (const t of ['users', 'exam_domains', 'exams']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seedBase();
});

describe('재검수 배치 (#53)', () => {
  it('success 1 + fail 1 → 상태·attempts 반영, 재실행 시 due 없음', async () => {
    await seedQueue('qv-1', { status: 'queued', updatedAt: NOW });
    await seedQueue('qv-2', { status: 'queued', updatedAt: NOW + 1 });
    const repository = createD1RecheckRepository(db);

    const results = await runRecheckBatch({ repository, reviewer: fakeReviewer({ 'qv-1': 'succeeded', 'qv-2': 'failed' }), now: NOW, limit: 10 });
    expect(results).toEqual([
      { versionId: 'qv-1', outcome: 'succeeded' },
      { versionId: 'qv-2', outcome: 'failed' },
    ]);
    expect(await repository.find('qv-1')).toEqual({ status: 'succeeded', attempts: 1, lastAttemptAt: null, startedAt: NOW });
    expect(await repository.find('qv-2')).toEqual({ status: 'failed', attempts: 1, lastAttemptAt: NOW, startedAt: NOW });

    expect(await repository.listDue({ now: NOW + 1000, limit: 10 })).toEqual([]);
    expect(await runRecheckBatch({ repository, reviewer: fakeReviewer({}), now: NOW + 1000, limit: 10 })).toEqual([]);
    const retried = await repository.listDue({ now: NOW + RETRY_DELAY_MS, limit: 10 });
    expect(retried.map((d) => d.versionId)).toEqual(['qv-2']);
  });

  it('reviewer throw → failed로 변환하고 배치를 계속한다', async () => {
    await seedQueue('qv-1', { status: 'queued', updatedAt: NOW });
    await seedQueue('qv-2', { status: 'queued', updatedAt: NOW + 1 });
    const repository = createD1RecheckRepository(db);
    const throwing: ReviewerPort = {
      async review({ versionId }) {
        if (versionId === 'qv-1') throw new Error('ai down');
        return { outcome: 'succeeded' };
      },
    };

    const results = await runRecheckBatch({ repository, reviewer: throwing, now: NOW, limit: 10 });
    expect(results).toEqual([
      { versionId: 'qv-1', outcome: 'failed', reason: 'reviewer-error' },
      { versionId: 'qv-2', outcome: 'succeeded' },
    ]);
    expect((await repository.find('qv-1'))?.status).toBe('failed');
    expect((await repository.find('qv-2'))?.status).toBe('succeeded');
  });

  it('limit·updated_at asc·start null skip(중복 실행 보호)', async () => {
    await seedQueue('qv-1', { status: 'queued', updatedAt: NOW });
    await seedQueue('qv-2', { status: 'queued', updatedAt: NOW + 1 });
    const repository = createD1RecheckRepository(db);

    const first = await runRecheckBatch({ repository, reviewer: fakeReviewer({}), now: NOW, limit: 1 });
    expect(first.map((r) => r.versionId)).toEqual(['qv-1']);
    const second = await runRecheckBatch({ repository, reviewer: fakeReviewer({}), now: NOW, limit: 10 });
    expect(second.map((r) => r.versionId)).toEqual(['qv-2']);

    await db.prepare('DELETE FROM question_recheck_queue').run();
    await seedQueue('qv-1', { status: 'queued', updatedAt: NOW });
    await seedQueue('qv-2', { status: 'queued', updatedAt: NOW + 1 });
    expect(await repository.start({ versionId: 'qv-1', now: NOW })).not.toBeNull();
    const afterRace = await runRecheckBatch({ repository, reviewer: fakeReviewer({}), now: NOW, limit: 10 });
    expect(afterRace.map((r) => r.versionId)).toEqual(['qv-2']);
  });

  it('finish null(경합)이면 결과에 추가하지 않고 skip한다', async () => {
    const base = createD1RecheckRepository(db);
    await seedQueue('qv-1', { status: 'queued', updatedAt: NOW });
    const finishNullRepo: RecheckRepository = {
      ...base,
      async finish() {
        return null;
      },
    };
    const results = await runRecheckBatch({ repository: finishNullRepo, reviewer: fakeReviewer({}), now: NOW, limit: 10 });
    expect(results).toEqual([]);
  });
});
