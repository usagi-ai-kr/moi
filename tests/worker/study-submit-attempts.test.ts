import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRecord } from '@/app/stats/attempt-ports';
import type { StudySet } from '@/domain/study/types';
import { createD1StudySetRepository } from '@/infra/persistence/study-repository';
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

// 이슈 #54 submit+attempt 원자 저장 — D1 batch로 묶어 제출 성공 시에만 attempt가 남는다.
const db = env.DB;
const NOW = 1792320000;

function submittedSet(id: string): StudySet {
  return {
    id,
    userId: 'u-1',
    examId: 'e-1',
    mode: 'all',
    status: 'submitted',
    createdAt: NOW,
    submittedAt: NOW + 100,
    items: [],
    result: {
      answeredCount: 2,
      correctCount: 1,
      accuracyPercent: 50,
      passCount: 0,
      unansweredCount: 0,
      perItem: [],
    },
  };
}

function attempt(over: Partial<AttemptRecord> & { attemptId: string; questionId: string }): AttemptRecord {
  return {
    userId: 'u-1',
    examId: 'e-1',
    questionVersionId: `${over.questionId}-v1`,
    outcome: 'correct',
    occurredAt: NOW + 100,
    source: 'set',
    sourceId: 'set-1',
    excludedAt: null,
    firstAttempt: false,
    ...over,
  };
}

async function seedBase(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  for (const q of ['q-1', 'q-2']) {
    await db
      .prepare("INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES (?1, 'e-1', 'd-1', 'active', ?2, ?2)")
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

async function seedActiveSet(id: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO study_sets (id, user_id, exam_id, mode, domain_id, status, created_at, submitted_at, result_json) VALUES (?1, 'u-1', 'e-1', 'all', NULL, 'active', ?2, NULL, NULL)",
    )
    .bind(id, NOW)
    .run();
}

async function setStatus(id: string): Promise<string | null> {
  const row = await db.prepare('SELECT status FROM study_sets WHERE id = ?1').bind(id).first<{ status: string }>();
  return row?.status ?? null;
}

async function countAttempts(): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM study_attempts').first<{ c: number }>();
  return row?.c ?? -1;
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
  for (const t of ['study_attempts', 'study_set_items', 'study_sets', 'question_versions', 'questions']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  for (const t of ['users', 'exam_domains', 'exams']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seedBase();
});

describe('submit+attempt 원자 저장 (#54)', () => {
  it('제출 성공 시 attempt 2행 저장·세트 submitted', async () => {
    await seedActiveSet('set-1');
    const repo = createD1StudySetRepository(db);
    const ok = await repo.submit({
      set: submittedSet('set-1'),
      attempts: [
        attempt({ attemptId: 'a-1', questionId: 'q-1', outcome: 'correct', source: 'set', sourceId: 'set-1', firstAttempt: true }),
        attempt({ attemptId: 'a-2', questionId: 'q-2', outcome: 'wrong', source: 'set', sourceId: 'set-1', firstAttempt: false }),
      ],
    });
    expect(ok).toBe(true);
    expect(await setStatus('set-1')).toBe('submitted');
    expect(await countAttempts()).toBe(2);
    const rows = await db
      .prepare('SELECT attempt_id, source, source_id, question_id, first_attempt, outcome FROM study_attempts ORDER BY question_id')
      .all<{ attempt_id: string; source: string; source_id: string; question_id: string; first_attempt: number; outcome: string }>();
    expect(rows.results).toMatchObject([
      { attempt_id: 'a-1', source: 'set', source_id: 'set-1', question_id: 'q-1', first_attempt: 1, outcome: 'correct' },
      { attempt_id: 'a-2', source: 'set', source_id: 'set-1', question_id: 'q-2', first_attempt: 0, outcome: 'wrong' },
    ]);
  });

  it('이미 submitted면 false·attempt 추가 없음', async () => {
    await seedActiveSet('set-1');
    const repo = createD1StudySetRepository(db);
    const first = await repo.submit({
      set: submittedSet('set-1'),
      attempts: [
        attempt({ attemptId: 'a-1', questionId: 'q-1', sourceId: 'set-1' }),
        attempt({ attemptId: 'a-2', questionId: 'q-2', sourceId: 'set-1' }),
      ],
    });
    expect(first).toBe(true);
    expect(await countAttempts()).toBe(2);
    const retry = await repo.submit({
      set: submittedSet('set-1'),
      attempts: [
        attempt({ attemptId: 'a-3', questionId: 'q-1', sourceId: 'set-1', outcome: 'wrong' }),
        attempt({ attemptId: 'a-4', questionId: 'q-2', sourceId: 'set-1', outcome: 'correct' }),
      ],
    });
    expect(retry).toBe(false);
    expect(await countAttempts()).toBe(2);
    expect(await setStatus('set-1')).toBe('submitted');
  });

  it('batch 실패(FK 위반) 시 세트는 active로 남는다', async () => {
    await seedActiveSet('set-fk');
    const repo = createD1StudySetRepository(db);
    const bad = attempt({
      attemptId: 'fk-1',
      questionId: 'missing-q',
      questionVersionId: 'missing-qv',
      sourceId: 'set-fk',
    });
    await expect(repo.submit({ set: { ...submittedSet('set-fk') }, attempts: [bad] })).rejects.toThrow();
    expect(await setStatus('set-fk')).toBe('active');
    expect(await countAttempts()).toBe(0);
  });
});
