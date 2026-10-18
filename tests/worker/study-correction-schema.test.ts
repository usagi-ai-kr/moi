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
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #53 study_corrections D1 스키마 — 0000~0010 전체 적용, 테이블·UNIQUE·INDEX·FK·필수 컬럼을 증명한다.
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
    for (const v of [1, 2]) {
      await db
        .prepare(
          "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, ?3, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?4)",
        )
        .bind(`${q}-v${v}`, q, v, NOW)
        .run();
    }
  }
  await db
    .prepare("INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at, submitted_at) VALUES ('set-1', 'u-1', 'e-1', 'full', 'submitted', ?1, ?1)")
    .bind(NOW)
    .run();
  await db
    .prepare("INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at, submitted_at) VALUES ('set-2', 'u-1', 'e-1', 'weakness', 'submitted', ?1, ?1)")
    .bind(NOW)
    .run();
}

function correction(id: string, over: Partial<Record<string, string | number | null>> = {}): Promise<unknown> {
  const row = {
    id,
    set_id: 'set-1',
    question_id: 'q-1',
    question_version_id: 'q-1-v2',
    reason: 'answer-changed',
    source: 'recheck',
    actor: 'admin-1',
    created_at: NOW,
    ...over,
  } as Record<string, string | number | null>;
  const keys = Object.keys(row);
  const sql = `INSERT INTO study_corrections (${keys.join(', ')}) VALUES (${keys.map((_, i) => `?${i + 1}`).join(', ')})`;
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
    migration0010,
  ]);
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 테스트가 실제 강제 여부를 드러낸다.
  }
});

beforeEach(async () => {
  await db.prepare('DELETE FROM study_corrections').run();
  for (const t of ['study_set_items', 'study_sets', 'question_versions', 'questions']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  for (const t of ['users', 'exam_domains', 'exams']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
});

describe('study_corrections 스키마 (0010_add-study-corrections)', () => {
  it('테이블·UNIQUE·INDEX·FK가 마이그레이션으로 만들어진다', async () => {
    const table = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'study_corrections'")
      .first<{ sql: string }>();
    expect(table?.sql).toBeTruthy();
    expect(table?.sql).toContain('FOREIGN KEY');
    for (const col of ['id', 'set_id', 'question_id', 'question_version_id', 'reason', 'source', 'actor', 'created_at']) {
      expect(table?.sql).toContain(col);
    }
    const indexes = await db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'study_corrections'")
      .all<{ name: string; sql: string | null }>();
    const byName = new Map(indexes.results.map((r) => [r.name, r.sql ?? '']));
    for (const name of ['study_corrections_set_version_uq', 'study_corrections_set_id_idx', 'study_corrections_question_version_idx']) {
      expect(byName.has(name)).toBe(true);
    }
    expect(byName.get('study_corrections_set_version_uq')).toContain('question_version_id');
  });

  it('같은 (set_id, question_version_id) 중복은 거부, 다른 version/set은 허용', async () => {
    await seedBase();
    await correction('c-1');
    await expect(correction('c-2')).rejects.toThrow();
    await correction('c-3', { question_version_id: 'q-1-v1', question_id: 'q-1' });
    await correction('c-4', { set_id: 'set-2' });
    await correction('c-5', { question_id: 'q-2', question_version_id: 'q-2-v2' });
    const row = await db.prepare('SELECT COUNT(*) AS c FROM study_corrections').first<{ c: number }>();
    expect(row?.c).toBe(4);
  });

  it('FK: 존재하지 않는 set/question/version 정정은 거부한다', async () => {
    await seedBase();
    await expect(correction('f-1', { set_id: 'missing-set' })).rejects.toThrow();
    await expect(correction('f-2', { question_id: 'missing-q' })).rejects.toThrow();
    await expect(correction('f-3', { question_version_id: 'missing-qv' })).rejects.toThrow();
  });

  it('reason/source 필수, actor 기본 system, createdAt 저장, PK 중복 거부', async () => {
    await seedBase();
    await expect(correction('n-1', { reason: null })).rejects.toThrow();
    await expect(correction('n-2', { source: null })).rejects.toThrow();
    await db
      .prepare(
        "INSERT INTO study_corrections (id, set_id, question_id, question_version_id, reason, source, created_at) VALUES ('d-1', 'set-1', 'q-1', 'q-1-v2', 'answer-changed', 'admin', ?1)",
      )
      .bind(NOW)
      .run();
    const row = await db
      .prepare('SELECT actor, source, created_at FROM study_corrections WHERE id = ?1')
      .bind('d-1')
      .first<{ actor: string; source: string; created_at: number }>();
    expect(row).toMatchObject({ actor: 'system', source: 'admin', created_at: NOW });
    await expect(correction('d-1', { set_id: 'set-2' })).rejects.toThrow();
  });
});
