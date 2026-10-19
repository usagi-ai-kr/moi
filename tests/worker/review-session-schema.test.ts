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

// 이슈 #54/#51 review_sessions D1 스키마(ADR-0020/0027) — 테이블·부분 UNIQUE·FK를 증명한다.
const db = env.DB;
const NOW = 1792998000;

async function seedUser(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
}

function insertSession(over: Partial<Record<string, string | number | null>> = {}): Promise<unknown> {
  const row = {
    id: 'rs-1',
    user_id: 'u-1',
    exam_id: 'e-1',
    mode: 'wrong',
    status: 'active',
    created_at: NOW,
    ended_at: null,
    cursor: 0,
    items: '[]',
    ...over,
  } as Record<string, string | number | null>;
  const keys = Object.keys(row);
  const sql = `INSERT INTO review_sessions (${keys.join(', ')}) VALUES (${keys.map((_, i) => `?${i + 1}`).join(', ')})`;
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
    migration0011,
  ]);
});

beforeEach(async () => {
  await db.prepare('DELETE FROM review_sessions').run();
  await db.prepare('DELETE FROM users').run();
});

describe('review_sessions 스키마 (0011_add-review-sessions)', () => {
  it('테이블·컬럼·FK·부분 UNIQUE가 마이그레이션으로 만들어진다', async () => {
    const table = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'review_sessions'")
      .first<{ sql: string }>();
    expect(table?.sql).toBeTruthy();
    expect(table?.sql).toContain('FOREIGN KEY');
    for (const col of ['id', 'user_id', 'exam_id', 'mode', 'status', 'created_at', 'ended_at', 'cursor', 'items']) {
      expect(table?.sql).toContain(col);
    }
    const index = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'review_sessions_active_uq'")
      .first<{ sql: string }>();
    expect(index?.sql).toContain('UNIQUE INDEX');
    expect(index?.sql).toContain('(`user_id`,`exam_id`,`mode`)');
    expect(index?.sql).toContain("'active'");
  });

  it('활성 회차 (userId, examId, mode) 중복은 거부, 다른 mode·examId는 허용', async () => {
    await seedUser();
    await insertSession();
    // 같은 (user, exam, mode) 두 번째 활성 회차 → 부분 UNIQUE 위반
    await expect(insertSession({ id: 'rs-2' })).rejects.toThrow();
    // 다른 mode는 별개 축 — 허용(모드별 독립 회차, ADR-0020)
    await insertSession({ id: 'rs-3', mode: 'bookmark' });
    // 다른 examId·userId도 허용
    await insertSession({ id: 'rs-4', exam_id: 'e-2' });
    await db.prepare("INSERT INTO users (id, created_at, updated_at) VALUES ('u-2', ?1, ?1)").bind(NOW).run();
    await insertSession({ id: 'rs-5', user_id: 'u-2' });
    const row = await db.prepare('SELECT COUNT(*) AS c FROM review_sessions').first<{ c: number }>();
    expect(row?.c).toBe(4);
  });

  it('종료(status=ended) 회차는 부분 UNIQUE 대상이 아니어서 같은 (user, exam, mode) 중복 허용', async () => {
    await seedUser();
    await insertSession({ id: 'rs-end-1', status: 'ended', ended_at: NOW + 100 });
    await insertSession({ id: 'rs-end-2', status: 'ended', ended_at: NOW + 200 });
    // 활성은 별도로 유지 가능 — 활성 1개 제약은 대상 아님
    await insertSession({ id: 'rs-active' });
    const row = await db.prepare('SELECT COUNT(*) AS c FROM review_sessions').first<{ c: number }>();
    expect(row?.c).toBe(3);
  });

  it('FK: 존재하지 않는 user_id 기록은 거부한다', async () => {
    await expect(insertSession({ user_id: 'missing-u' })).rejects.toThrow();
  });
});
