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
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #54 study_attempts D1 스키마 — 0000~0009 전체 적용, 테이블·인덱스·FK·UNIQUE·기본값을 증명한다.
const db = env.DB;
const NOW = 1792320000;

async function seedBase(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(NOW).run();
  await db
    .prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)")
    .run();
  for (const q of ['q-1', 'q-2']) {
    await db
      .prepare(
        "INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES (?1, 'e-1', 'd-1', 'active', ?2, ?2)",
      )
      .bind(q, NOW)
      .run();
    await db
      .prepare(
        "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?3)",
      )
      .bind(`${q}-v1`, q, NOW)
      .run();
  }
}

function attempt(id: string, over: Partial<Record<string, string | number | null>> = {}): Promise<unknown> {
  const row = {
    attempt_id: id,
    user_id: 'u-1',
    exam_id: 'e-1',
    question_id: 'q-1',
    question_version_id: 'q-1-v1',
    outcome: 'correct',
    occurred_at: NOW,
    source: 'set',
    source_id: 'set-1',
    excluded_at: null,
    first_attempt: 0,
    ...over,
  } as Record<string, string | number | null>;
  const keys = Object.keys(row);
  const sql = `INSERT INTO study_attempts (${keys.join(', ')}) VALUES (${keys.map((_, i) => `?${i + 1}`).join(', ')})`;
  return db
    .prepare(sql)
    .bind(...keys.map((k) => row[k]))
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
    migration0009,
  ]);
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 테스트가 실제 강제 여부를 드러낸다.
  }
});

beforeEach(async () => {
  for (const t of ['study_attempts', 'question_versions', 'questions']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  for (const t of ['users', 'exam_domains', 'exams']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
});

describe('study_attempts 스키마 (0009_add-study-attempts)', () => {
  it('테이블·UNIQUE·INDEX·FK가 마이그레이션으로 만들어진다', async () => {
    const table = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'study_attempts'")
      .first<{ sql: string }>();
    expect(table?.sql).toBeTruthy();
    expect(table?.sql).toContain('FOREIGN KEY');
    for (const col of ['attempt_id', 'user_id', 'exam_id', 'question_id', 'question_version_id', 'outcome', 'occurred_at', 'source', 'source_id', 'excluded_at', 'first_attempt']) {
      expect(table?.sql).toContain(col);
    }
    const indexes = await db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'study_attempts'")
      .all<{ name: string; sql: string | null }>();
    const byName = new Map(indexes.results.map((r) => [r.name, r.sql ?? '']));
    for (const name of [
      'study_attempts_source_source_question_uq',
      'study_attempts_user_exam_occurred_idx',
      'study_attempts_user_exam_question_idx',
      'study_attempts_question_version_idx',
    ]) {
      expect(byName.has(name)).toBe(true);
    }
    expect(byName.get('study_attempts_source_source_question_uq')).toContain('source_id');
    expect(byName.get('study_attempts_user_exam_occurred_idx')).toContain('occurred_at');
    expect(byName.get('study_attempts_user_exam_question_idx')).toContain('question_id');
  });

  it('같은 (source, sourceId, questionId) 중복은 거부, 다른 questionId/sourceId는 허용', async () => {
    await seedBase();
    await attempt('a-1');
    await expect(attempt('a-2')).rejects.toThrow();
    await attempt('a-3', { question_id: 'q-2', question_version_id: 'q-2-v1' });
    await attempt('a-4', { source_id: 'set-2' });
    await attempt('a-5', { source: 'review', source_id: 'set-1' });
    const row = await db.prepare('SELECT COUNT(*) AS c FROM study_attempts').first<{ c: number }>();
    expect(row?.c).toBe(4);
  });

  it('FK: 존재하지 않는 user/question/version 기록은 거부한다', async () => {
    await seedBase();
    await expect(attempt('f-1', { user_id: 'missing-u' })).rejects.toThrow();
    await expect(attempt('f-2', { question_id: 'missing-q' })).rejects.toThrow();
    await expect(attempt('f-3', { question_version_id: 'missing-qv' })).rejects.toThrow();
  });

  it('firstAttempt 기본 false, excludedAt null 허용, PK 중복 거부', async () => {
    await seedBase();
    await db
      .prepare(
        "INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id) VALUES ('p-1', 'u-1', 'e-1', 'q-1', 'q-1-v1', 'incorrect', ?1, 'set', 'set-9')",
      )
      .bind(NOW)
      .run();
    const row = await db
      .prepare('SELECT first_attempt, excluded_at FROM study_attempts WHERE attempt_id = ?1')
      .bind('p-1')
      .first<{ first_attempt: number; excluded_at: number | null }>();
    expect(row).toMatchObject({ first_attempt: 0, excluded_at: null });
    await expect(attempt('p-1', { source_id: 'set-10' })).rejects.toThrow();
    const count = await db.prepare('SELECT COUNT(*) AS c FROM study_attempts').first<{ c: number }>();
    expect(count?.c).toBe(1);
  });
});
