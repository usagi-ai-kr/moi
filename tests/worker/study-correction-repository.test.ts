import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createD1CorrectionRepository } from '@/infra/persistence/study-correction-repository';
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

// 이슈 #53 정정 이벤트 D1 어댑터 — 저장·중복 변환·set 격리·목록 순서·FK 위반 throw를 증명한다.
const db = env.DB;
const NOW = 1792320000;

async function seedBase(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  for (const q of ['q-1', 'q-2']) {
    await db
      .prepare("INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES (?1, 'e-1', 'd-1', 'active', ?2, ?2)")
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
  for (const s of ['set-1', 'set-2']) {
    await db
      .prepare("INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at, submitted_at) VALUES (?1, 'u-1', 'e-1', 'full', 'submitted', ?2, ?2)")
      .bind(s, NOW)
      .run();
  }
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
  await seedBase();
});

describe('정정 이벤트 저장소 (#53)', () => {
  it('record 1건 → list 1건, 필드 보존(actor 기본 system 포함)', async () => {
    const repo = createD1CorrectionRepository(db);
    const outcome = await repo.record({
      id: 'c-1',
      setId: 'set-1',
      questionId: 'q-1',
      questionVersionId: 'q-1-v2',
      reason: 'answer-changed',
      source: 'recheck',
      createdAt: NOW,
    });
    expect(outcome).toBe('recorded');
    const list = await repo.listBySet('set-1');
    expect(list).toEqual([
      {
        id: 'c-1',
        setId: 'set-1',
        questionId: 'q-1',
        questionVersionId: 'q-1-v2',
        reason: 'answer-changed',
        source: 'recheck',
        actor: 'system',
        createdAt: NOW,
      },
    ]);
  });

  it('명시한 actor를 그대로 보존한다', async () => {
    const repo = createD1CorrectionRepository(db);
    await repo.record({
      id: 'c-1',
      setId: 'set-1',
      questionId: 'q-1',
      questionVersionId: 'q-1-v2',
      reason: 'answer-changed',
      source: 'admin',
      actor: 'admin-1',
      createdAt: NOW,
    });
    const list = await repo.listBySet('set-1');
    expect(list[0]?.actor).toBe('admin-1');
  });

  it('같은 set/version 중복 → duplicate, list는 1건 유지', async () => {
    const repo = createD1CorrectionRepository(db);
    const base = {
      setId: 'set-1',
      questionId: 'q-1',
      questionVersionId: 'q-1-v2',
      reason: 'answer-changed',
      source: 'recheck',
      createdAt: NOW,
    };
    expect(await repo.record({ id: 'c-1', ...base })).toBe('recorded');
    expect(await repo.record({ id: 'c-2', ...base, createdAt: NOW + 1 })).toBe('duplicate');
    expect(await repo.listBySet('set-1')).toHaveLength(1);
  });

  it('다른 set/version은 허용되고, 다른 set 목록은 격리된다', async () => {
    const repo = createD1CorrectionRepository(db);
    expect(
      await repo.record({
        id: 'c-1',
        setId: 'set-1',
        questionId: 'q-1',
        questionVersionId: 'q-1-v1',
        reason: 'answer-changed',
        source: 'recheck',
        createdAt: NOW,
      }),
    ).toBe('recorded');
    expect(
      await repo.record({
        id: 'c-2',
        setId: 'set-2',
        questionId: 'q-1',
        questionVersionId: 'q-1-v1',
        reason: 'typo',
        source: 'admin',
        createdAt: NOW,
      }),
    ).toBe('recorded');
    expect(await repo.listBySet('set-1')).toHaveLength(1);
    expect(await repo.listBySet('set-2')).toHaveLength(1);
    expect(await repo.listBySet('missing-set')).toEqual([]);
  });

  it('listBySet는 createdAt asc, id asc로 정렬한다', async () => {
    const repo = createD1CorrectionRepository(db);
    const record = (id: string, questionVersionId: string, createdAt: number) =>
      repo.record({ id, setId: 'set-1', questionId: 'q-1', questionVersionId, reason: 'typo', source: 'admin', createdAt });
    await record('c-b', 'q-1-v1', NOW + 5);
    await record('c-a', 'q-2-v1', NOW + 5);
    await record('c-z', 'q-1-v2', NOW + 1);
    const list = await repo.listBySet('set-1');
    expect(list.map((r) => r.id)).toEqual(['c-z', 'c-a', 'c-b']);
  });

  it('FK 위반/잘못된 입력은 throw한다(기존 DB)', async () => {
    const repo = createD1CorrectionRepository(db);
    const base = { id: 'f-1', questionId: 'q-1', questionVersionId: 'q-1-v2', reason: 'typo', source: 'admin', createdAt: NOW };
    await expect(repo.record({ ...base, setId: 'missing-set' })).rejects.toThrow();
    await expect(repo.record({ ...base, id: 'f-2', setId: 'set-1', questionId: 'missing-q' })).rejects.toThrow();
    await expect(repo.record({ ...base, id: 'f-3', setId: 'set-1', questionVersionId: 'missing-qv' })).rejects.toThrow();
  });
});
