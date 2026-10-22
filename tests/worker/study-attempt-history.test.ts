import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRecord } from '@/app/stats/attempt-ports';
import { computeStudyStats } from '@/domain/stats/study-stats';
import { createD1StudyAttemptRepository } from '@/infra/persistence/study-attempt-repository';
import { createD1StudyHistoryPort } from '@/infra/persistence/study-attempt-history';
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

// 이슈 #54 study_attempts → 통계 이력 어댑터 — JOIN·필터·정렬·매핑·fail-closed를 증명한다.
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

describe('study_attempts → 통계 이력 어댑터 (#54)', () => {
  it('4종 outcome·firstAttempt·domainId·attemptId를 보존하고 occurredAt/attemptId 순으로 정렬한다', async () => {
    const writer = createD1StudyAttemptRepository(db);
    await writer.recordBatch({
      attempts: [
        attempt({ attemptId: 'h-3', questionId: 'q-3', outcome: 'pass', occurredAt: NOW + 2, sourceId: 's-3', firstAttempt: false }),
        attempt({ attemptId: 'h-1', questionId: 'q-1', outcome: 'correct', occurredAt: NOW, sourceId: 's-1', firstAttempt: true }),
        attempt({ attemptId: 'h-4', questionId: 'q-4', outcome: 'unanswered', occurredAt: NOW + 3, sourceId: 's-4', firstAttempt: false }),
        attempt({ attemptId: 'h-2', questionId: 'q-2', outcome: 'wrong', occurredAt: NOW + 1, sourceId: 's-2', firstAttempt: false }),
      ],
    });
    const history = createD1StudyHistoryPort(db);
    const entries = await history.load({ userId: 'u-1', examId: 'e-1' });
    expect(entries.map((e) => e.attemptId)).toEqual(['h-1', 'h-2', 'h-3', 'h-4']);
    expect(entries.map((e) => e.outcome)).toEqual(['correct', 'wrong', 'pass', 'unanswered']);
    expect(entries.map((e) => e.firstAttempt)).toEqual([true, false, false, false]);
    expect(entries.map((e) => e.domainId)).toEqual(['d-1', 'd-1', 'd-1', 'd-1']);
    expect(entries.map((e) => e.questionId)).toEqual(['q-1', 'q-2', 'q-3', 'q-4']);
    expect(entries[0]).toMatchObject({ examId: 'e-1', occurredAt: NOW });
  });

  it('같은 occurredAt이면 attemptId 순으로 정렬한다', async () => {
    const writer = createD1StudyAttemptRepository(db);
    await writer.recordBatch({
      attempts: [
        attempt({ attemptId: 's-2', questionId: 'q-2', occurredAt: NOW + 10, sourceId: 's-b' }),
        attempt({ attemptId: 's-1', questionId: 'q-1', occurredAt: NOW + 10, sourceId: 's-a' }),
      ],
    });
    const history = createD1StudyHistoryPort(db);
    const entries = await history.load({ userId: 'u-1', examId: 'e-1' });
    expect(entries.map((e) => e.attemptId)).toEqual(['s-1', 's-2']);
  });

  it('다른 exam과 excludedAt 행은 제외한다', async () => {
    const writer = createD1StudyAttemptRepository(db);
    await writer.recordBatch({
      attempts: [
        attempt({ attemptId: 'k-1', questionId: 'q-1', sourceId: 's-keep' }),
        attempt({ attemptId: 'k-9', questionId: 'q-9', examId: 'e-2', questionVersionId: 'q-9-v1', sourceId: 's-keep' }),
        attempt({ attemptId: 'k-x', questionId: 'q-2', outcome: 'wrong', sourceId: 's-excluded', excludedAt: NOW }),
      ],
    });
    const history = createD1StudyHistoryPort(db);
    const entries = await history.load({ userId: 'u-1', examId: 'e-1' });
    expect(entries.map((e) => e.attemptId)).toEqual(['k-1']);
  });

  it('잘못된 outcome은 throw한다(fail-closed)', async () => {
    const writer = createD1StudyAttemptRepository(db);
    await writer.recordBatch({
      attempts: [attempt({ attemptId: 'b-1', questionId: 'q-1', outcome: 'bogus', sourceId: 's-bogus' })],
    });
    const history = createD1StudyHistoryPort(db);
    await expect(history.load({ userId: 'u-1', examId: 'e-1' })).rejects.toThrow();
  });

  it('load 결과를 computeStudyStats에 바로 넣어 overall/domain 정답률을 계산한다', async () => {
    const writer = createD1StudyAttemptRepository(db);
    await writer.recordBatch({
      attempts: [
        attempt({ attemptId: 'c-1', questionId: 'q-1', outcome: 'correct', occurredAt: NOW, sourceId: 's-1', firstAttempt: true }),
        attempt({ attemptId: 'c-2', questionId: 'q-2', outcome: 'wrong', occurredAt: NOW + 1, sourceId: 's-2', firstAttempt: true }),
      ],
    });
    const history = createD1StudyHistoryPort(db);
    const entries = await history.load({ userId: 'u-1', examId: 'e-1' });
    const stats = computeStudyStats(entries, { examId: 'e-1', totalQuestions: 10, now: NOW + 100 });
    expect(stats.overallAccuracy).toBe(0.5);
    expect(stats.domains).toHaveLength(1);
    expect(stats.domains[0]).toMatchObject({ domainId: 'd-1', cumulativeAccuracy: 0.5 });
  });
});
