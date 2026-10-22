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
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #53 신고·재검수 D1 스키마 — 마이그레이션·UNIQUE·FK·PK 중복 거부를 증명한다.
const db = env.DB;
const NOW = 1792320000;

async function seedBase(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-2', NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(NOW).run();
  await db
    .prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)")
    .run();
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
  await db
    .prepare(
      "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES ('qv-2', 'q-1', 2, 'stem2', 'exp2', '[]', '[]', 'h2', 'pending', ?1)",
    )
    .bind(NOW)
    .run();
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
  ]);
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 테스트가 실제 강제 여부를 드러낸다.
  }
});

beforeEach(async () => {
  for (const t of ['question_recheck_queue', 'question_reports', 'question_versions', 'questions']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  for (const t of ['users', 'exam_domains', 'exams']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
});

describe('신고·재검수 스키마 (0008_add-reports-recheck)', () => {
  it('두 테이블·UNIQUE·INDEX·FK가 마이그레이션으로 만들어진다', async () => {
    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('question_reports', 'question_recheck_queue')")
      .all<{ name: string }>();
    expect(tables.results.map((r) => r.name).sort()).toEqual(['question_recheck_queue', 'question_reports']);
    const indexes = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL")
      .all<{ name: string }>();
    const names = indexes.results.map((r) => r.name).join(',');
    for (const expected of [
      'question_reports_version_user_uq',
      'question_reports_version_id_idx',
      'question_reports_user_id_idx',
    ]) {
      expect(names).toContain(expected);
    }
    const reportSql = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'question_reports'")
      .first<{ sql: string }>();
    expect(reportSql?.sql).toContain('FOREIGN KEY');
    const queueSql = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'question_recheck_queue'")
      .first<{ sql: string }>();
    expect(queueSql?.sql).toContain('FOREIGN KEY');
    expect(queueSql?.sql).toContain('question_version_id');
  });

  it('같은 version/user 중복 신고는 거부, 다른 user/version은 허용', async () => {
    await seedBase();
    await db
      .prepare(
        "INSERT INTO question_reports (id, question_id, question_version_id, user_id, reason, created_at) VALUES ('r-1', 'q-1', 'qv-1', 'u-1', '오타', ?1)",
      )
      .bind(NOW)
      .run();
    await expect(
      db
        .prepare(
          "INSERT INTO question_reports (id, question_id, question_version_id, user_id, reason, created_at) VALUES ('r-2', 'q-1', 'qv-1', 'u-1', '중복', ?1)",
        )
        .bind(NOW)
        .run(),
    ).rejects.toThrow();
    await db
      .prepare(
        "INSERT INTO question_reports (id, question_id, question_version_id, user_id, reason, created_at) VALUES ('r-3', 'q-1', 'qv-1', 'u-2', '다른 계정', ?1)",
      )
      .bind(NOW)
      .run();
    await db
      .prepare(
        "INSERT INTO question_reports (id, question_id, question_version_id, user_id, reason, created_at) VALUES ('r-4', 'q-1', 'qv-2', 'u-1', '다른 버전', ?1)",
      )
      .bind(NOW)
      .run();
    const row = await db.prepare('SELECT COUNT(*) AS c FROM question_reports').first<{ c: number }>();
    expect(row?.c).toBe(3);
  });

  it('FK: 존재하지 않는 version/user 신고는 거부한다', async () => {
    await seedBase();
    await expect(
      db
        .prepare(
          "INSERT INTO question_reports (id, question_id, question_version_id, user_id, reason, created_at) VALUES ('r-x', 'q-1', 'missing-qv', 'u-1', 'x', ?1)",
        )
        .bind(NOW)
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare(
          "INSERT INTO question_reports (id, question_id, question_version_id, user_id, reason, created_at) VALUES ('r-y', 'q-1', 'qv-1', 'missing-u', 'x', ?1)",
        )
        .bind(NOW)
        .run(),
    ).rejects.toThrow();
  });

  it('recheck queue PK 중복은 거부, 기본값 queued/0이 적용된다', async () => {
    await seedBase();
    await db
      .prepare('INSERT INTO question_recheck_queue (question_version_id, updated_at) VALUES (?1, ?2)')
      .bind('qv-1', NOW)
      .run();
    await expect(
      db.prepare('INSERT INTO question_recheck_queue (question_version_id, updated_at) VALUES (?1, ?2)').bind('qv-1', NOW).run(),
    ).rejects.toThrow();
    const row = await db
      .prepare('SELECT status, attempts FROM question_recheck_queue WHERE question_version_id = ?1')
      .bind('qv-1')
      .first<{ status: string; attempts: number }>();
    expect(row).toMatchObject({ status: 'queued', attempts: 0 });
  });
});
