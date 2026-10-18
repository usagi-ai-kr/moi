import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRecord } from '@/app/stats/attempt-ports';
import { createD1StudyAttemptRepository } from '@/infra/persistence/study-attempt-repository';
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

// 이슈 #54 study_attempts 저장 어댑터 — batch 멱등·채점 여부·사용자/시험별 조회를 증명한다.
const db = env.DB;
const NOW = 1792320000;

function attempt(over: Partial<AttemptRecord> & { attemptId: string; questionId: string }): AttemptRecord {
  return {
    userId: 'u-1',
    examId: 'e-1',
    questionVersionId: `${over.questionId}-v1`,
    outcome: 'correct',
    occurredAt: NOW,
    source: 'set',
    sourceId: 'set-1',
    excludedAt: null,
    firstAttempt: false,
    ...over,
  };
}

async function seedBase(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  for (const [id, code] of [['e-1', 'saa-c03'], ['e-2', 'sap-c02']] as const) {
    await db.prepare('INSERT INTO exams (id, code, name, created_at) VALUES (?1, ?2, ?3, ?4)').bind(id, code, code, NOW).run();
  }
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-2', 'e-2', 'sec', 'sec', 100)").run();
  const questions: Array<[string, string, string]> = [
    ['q-1', 'e-1', 'd-1'],
    ['q-2', 'e-1', 'd-1'],
    ['q-3', 'e-1', 'd-1'],
    ['q-4', 'e-1', 'd-1'],
    ['q-5', 'e-1', 'd-1'],
    ['q-9', 'e-2', 'd-2'],
  ];
  for (const [q, examId, domainId] of questions) {
    await db
      .prepare('INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES (?1, ?2, ?3, \'active\', ?4, ?4)')
      .bind(q, examId, domainId, NOW)
      .run();
    await db
      .prepare(
        "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?3)",
      )
      .bind(`${q}-v1`, q, NOW)
      .run();
  }
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
});

beforeEach(async () => {
  for (const t of ['study_attempts', 'question_versions', 'questions']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  for (const t of ['users', 'exam_domains', 'exams']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seedBase();
});

describe('study_attempts 저장 어댑터 (#54)', () => {
  it('batch 2건 → list 2건, firstAttempt/excludedAt 보존·정렬', async () => {
    const repo = createD1StudyAttemptRepository(db);
    await repo.recordBatch({
      attempts: [
        attempt({ attemptId: 'b-2', questionId: 'q-2', outcome: 'wrong', occurredAt: NOW + 1, sourceId: 'set-1', firstAttempt: false, excludedAt: NOW + 5 }),
        attempt({ attemptId: 'b-1', questionId: 'q-1', outcome: 'correct', occurredAt: NOW, sourceId: 'set-1', firstAttempt: true }),
      ],
    });
    const rows = await repo.listByUserExam({ userId: 'u-1', examId: 'e-1' });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.attemptId)).toEqual(['b-1', 'b-2']);
    expect(rows[0]).toMatchObject({ questionId: 'q-1', outcome: 'correct', occurredAt: NOW, firstAttempt: true, excludedAt: null });
    expect(rows[1]).toMatchObject({ questionId: 'q-2', outcome: 'wrong', occurredAt: NOW + 1, firstAttempt: false, excludedAt: NOW + 5 });
  });

  it('같은 (source, sourceId, questionId) 재삽입은 무시한다(멱등)', async () => {
    const repo = createD1StudyAttemptRepository(db);
    await repo.recordBatch({ attempts: [attempt({ attemptId: 'm-1', questionId: 'q-1' })] });
    expect(await countAttempts()).toBe(1);
    await repo.recordBatch({
      attempts: [attempt({ attemptId: 'm-2', questionId: 'q-1', outcome: 'wrong', occurredAt: NOW + 9 })],
    });
    expect(await countAttempts()).toBe(1);
    const rows = await repo.listByUserExam({ userId: 'u-1', examId: 'e-1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attemptId).toBe('m-1');
    expect(rows[0]?.outcome).toBe('correct');
  });

  it('같은 attemptId 재삽입은 예외 없이 무시한다(멱등)', async () => {
    const repo = createD1StudyAttemptRepository(db);
    await repo.recordBatch({ attempts: [attempt({ attemptId: 'p-1', questionId: 'q-1' })] });
    expect(await countAttempts()).toBe(1);
    await expect(
      repo.recordBatch({
        attempts: [attempt({ attemptId: 'p-1', questionId: 'q-2', outcome: 'wrong', sourceId: 'set-2' })],
      }),
    ).resolves.toBeUndefined();
    expect(await countAttempts()).toBe(1);
    const rows = await repo.listByUserExam({ userId: 'u-1', examId: 'e-1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attemptId: 'p-1', questionId: 'q-1', outcome: 'correct' });
  });

  it('hasGradedAttempt: correct/wrong true, pass/unanswered false, excluded true→false', async () => {
    const repo = createD1StudyAttemptRepository(db);
    await repo.recordBatch({
      attempts: [
        attempt({ attemptId: 'g-1', questionId: 'q-1', outcome: 'correct', sourceId: 's-correct' }),
        attempt({ attemptId: 'g-2', questionId: 'q-2', outcome: 'wrong', sourceId: 's-wrong' }),
        attempt({ attemptId: 'g-3', questionId: 'q-3', outcome: 'pass', sourceId: 's-pass' }),
        attempt({ attemptId: 'g-4', questionId: 'q-4', outcome: 'unanswered', sourceId: 's-unanswered' }),
        attempt({ attemptId: 'g-5', questionId: 'q-5', outcome: 'correct', sourceId: 's-excluded', excludedAt: NOW }),
      ],
    });
    await expect(repo.hasGradedAttempt({ userId: 'u-1', examId: 'e-1', questionId: 'q-1' })).resolves.toBe(true);
    await expect(repo.hasGradedAttempt({ userId: 'u-1', examId: 'e-1', questionId: 'q-2' })).resolves.toBe(true);
    await expect(repo.hasGradedAttempt({ userId: 'u-1', examId: 'e-1', questionId: 'q-3' })).resolves.toBe(false);
    await expect(repo.hasGradedAttempt({ userId: 'u-1', examId: 'e-1', questionId: 'q-4' })).resolves.toBe(false);
    await expect(repo.hasGradedAttempt({ userId: 'u-1', examId: 'e-1', questionId: 'q-5' })).resolves.toBe(false);
  });

  it('다른 exam/question은 격리된다', async () => {
    const repo = createD1StudyAttemptRepository(db);
    await repo.recordBatch({
      attempts: [
        attempt({ attemptId: 'x-1', questionId: 'q-1', examId: 'e-1', sourceId: 's-1' }),
        attempt({ attemptId: 'x-9', questionId: 'q-9', examId: 'e-2', questionVersionId: 'q-9-v1', sourceId: 's-1' }),
      ],
    });
    expect((await repo.listByUserExam({ userId: 'u-1', examId: 'e-1' })).map((r) => r.attemptId)).toEqual(['x-1']);
    expect((await repo.listByUserExam({ userId: 'u-1', examId: 'e-2' })).map((r) => r.attemptId)).toEqual(['x-9']);
    await expect(repo.hasGradedAttempt({ userId: 'u-1', examId: 'e-1', questionId: 'q-9' })).resolves.toBe(false);
    await expect(repo.hasGradedAttempt({ userId: 'u-1', examId: 'e-2', questionId: 'q-1' })).resolves.toBe(false);
    await expect(repo.hasGradedAttempt({ userId: 'u-1', examId: 'e-2', questionId: 'q-9' })).resolves.toBe(true);
  });
});
