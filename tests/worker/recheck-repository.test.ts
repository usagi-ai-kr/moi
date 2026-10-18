import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

// 이슈 #53 재검수 큐 D1 어댑터 — 순수 전이 + 조건부 UPDATE 경합 방지를 증명한다.
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
  await db
    .prepare(
      "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES ('qv-1', 'q-1', 1, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?1)",
    )
    .bind(NOW)
    .run();
}

async function seedQueue(input: { status?: string; attempts?: number; lastAttemptAt?: number | null; startedAt?: number | null }): Promise<void> {
  await db
    .prepare(
      'INSERT INTO question_recheck_queue (question_version_id, status, attempts, last_attempt_at, started_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    )
    .bind('qv-1', input.status ?? 'queued', input.attempts ?? 0, input.lastAttemptAt ?? null, input.startedAt ?? null, NOW)
    .run();
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

describe('재검수 큐 D1 어댑터 (#53)', () => {
  it('queued start → running attempts1, running 재시작 null', async () => {
    await seedQueue({ status: 'queued', attempts: 0 });
    const repo = createD1RecheckRepository(db);
    const started = await repo.start({ versionId: 'qv-1', now: NOW });
    expect(started).toEqual({ status: 'running', attempts: 1, lastAttemptAt: null, startedAt: NOW });
    const again = await repo.start({ versionId: 'qv-1', now: NOW + 1 });
    expect(again).toBeNull();
    expect(await repo.find('qv-1')).toEqual({ status: 'running', attempts: 1, lastAttemptAt: null, startedAt: NOW });
  });

  it('finish failed → lastAttemptAt, 24h 전 start null·24h 후 attempts2', async () => {
    await seedQueue({ status: 'queued', attempts: 0 });
    const repo = createD1RecheckRepository(db);
    const started = await repo.start({ versionId: 'qv-1', now: NOW });
    expect(started?.status).toBe('running');
    const finished = await repo.finish({ versionId: 'qv-1', now: NOW + 1000, outcome: 'failed' });
    expect(finished).toEqual({ status: 'failed', attempts: 1, lastAttemptAt: NOW + 1000, startedAt: NOW });
    const early = await repo.start({ versionId: 'qv-1', now: NOW + 1000 + RETRY_DELAY_MS - 1 });
    expect(early).toBeNull();
    const late = await repo.start({ versionId: 'qv-1', now: NOW + 1000 + RETRY_DELAY_MS });
    expect(late).toEqual({ status: 'running', attempts: 2, lastAttemptAt: NOW + 1000, startedAt: NOW + 1000 + RETRY_DELAY_MS });
  });

  it('attempts 3 failed start null, succeeded start null', async () => {
    const repo = createD1RecheckRepository(db);
    await seedQueue({ status: 'failed', attempts: 3, lastAttemptAt: NOW });
    expect(await repo.start({ versionId: 'qv-1', now: NOW + RETRY_DELAY_MS + 1 })).toBeNull();
    await db.prepare('DELETE FROM question_recheck_queue').run();
    await seedQueue({ status: 'succeeded', attempts: 1, lastAttemptAt: null, startedAt: NOW });
    expect(await repo.start({ versionId: 'qv-1', now: NOW + 1 })).toBeNull();
  });

  it('finish non-running null', async () => {
    await seedQueue({ status: 'queued', attempts: 0 });
    const repo = createD1RecheckRepository(db);
    expect(await repo.finish({ versionId: 'qv-1', now: NOW, outcome: 'succeeded' })).toBeNull();
    expect(await repo.finish({ versionId: 'qv-1', now: NOW, outcome: 'failed' })).toBeNull();
    expect(await repo.find('missing')).toBeNull();
  });
});
