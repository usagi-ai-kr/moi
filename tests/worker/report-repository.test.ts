import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { submitQuestionReport } from '@/app/reports/index';
import { createD1ReportRepository } from '@/infra/persistence/report-repository';
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

// 이슈 #53 신고 D1 어댑터·유스케이스 — 저장·신고율·재검수 큐 등록을 증명한다.
// autoStop 경계치는 기존 도메인 테스트(tests/unit/reports/report-rate.test.ts)를 재사용한다.
const db = env.DB;
const NOW = 1792320000;

async function seedBase(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-2', NOW, NOW).run();
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
  // u-1 제출 세트(qv-1) — 분모 1. u-2 미제출 세트(qv-1)·제출 세트(qv-2) — 분모·큐에 섞이면 안 된다.
  await db
    .prepare("INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at, submitted_at) VALUES ('s-1', 'u-1', 'e-1', 'all', 'submitted', ?1, ?1)")
    .bind(NOW)
    .run();
  await db
    .prepare("INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at) VALUES ('s-2', 'u-2', 'e-1', 'all', 'active', ?1)")
    .bind(NOW)
    .run();
  await db
    .prepare("INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at, submitted_at) VALUES ('s-3', 'u-2', 'e-1', 'all', 'submitted', ?1, ?1)")
    .bind(NOW)
    .run();
  const item = (setId: string, versionId: string, no: number) =>
    db
      .prepare(
        "INSERT INTO study_set_items (set_id, question_id, question_version_id, version_no, option_order, answer_option_ids) VALUES (?1, 'q-1', ?2, ?3, '[]', '[]')",
      )
      .bind(setId, versionId, no)
      .run();
  await item('s-1', 'qv-1', 1);
  await item('s-2', 'qv-1', 1);
  await item('s-3', 'qv-2', 2);
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
  for (const t of ['question_recheck_queue', 'question_reports', 'study_set_items', 'study_sets', 'question_versions', 'questions']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  for (const t of ['users', 'exam_domains', 'exams']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seedBase();
});

describe('신고 저장·신고율·재검수 큐 (#53)', () => {
  it('신고 1건 → recorded, 큐 1행, rate 1/1(requiresRecheck·미중지)', async () => {
    const repo = createD1ReportRepository(db);
    const r = await submitQuestionReport(
      { repository: repo },
      { id: 'r-1', questionId: 'q-1', questionVersionId: 'qv-1', userId: 'u-1', reason: 'typo', now: NOW },
    );
    expect(r).toMatchObject({ outcome: 'recorded', uniqueReporters: 1, solvedUsers: 1, rate: 1, requiresRecheck: true, autoStop: false });
    const queue = await db.prepare('SELECT COUNT(*) AS c FROM question_recheck_queue WHERE question_version_id = ?1').bind('qv-1').first<{ c: number }>();
    expect(queue?.c).toBe(1);
  });

  it('같은 user 같은 version 재신고 → duplicate, 큐 1행 유지', async () => {
    const repo = createD1ReportRepository(db);
    const deps = { repository: repo };
    await submitQuestionReport(deps, { id: 'r-1', questionId: 'q-1', questionVersionId: 'qv-1', userId: 'u-1', reason: 'typo', now: NOW });
    const dup = await submitQuestionReport(deps, { id: 'r-2', questionId: 'q-1', questionVersionId: 'qv-1', userId: 'u-1', reason: 'typo', now: NOW + 1 });
    expect(dup).toEqual({ outcome: 'duplicate' });
    const queue = await db.prepare('SELECT COUNT(*) AS c FROM question_recheck_queue').first<{ c: number }>();
    expect(queue?.c).toBe(1);
    const reports = await db.prepare('SELECT COUNT(*) AS c FROM question_reports').first<{ c: number }>();
    expect(reports?.c).toBe(1);
  });

  it('다른 user 신고 → rate 2/1, uniqueReporters 2, 큐 단일행', async () => {
    const repo = createD1ReportRepository(db);
    const deps = { repository: repo };
    await submitQuestionReport(deps, { id: 'r-1', questionId: 'q-1', questionVersionId: 'qv-1', userId: 'u-1', reason: 'typo', now: NOW });
    const r = await submitQuestionReport(deps, { id: 'r-3', questionId: 'q-1', questionVersionId: 'qv-1', userId: 'u-2', reason: 'answer', now: NOW + 1 });
    expect(r).toMatchObject({ outcome: 'recorded', uniqueReporters: 2, solvedUsers: 1, rate: 2 });
    const queue = await db.prepare('SELECT COUNT(*) AS c FROM question_recheck_queue').first<{ c: number }>();
    expect(queue?.c).toBe(1);
  });

  it('다른 version·미제출 set은 분모/큐에 섞이지 않는다', async () => {
    const repo = createD1ReportRepository(db);
    const rate = await repo.getRate({ questionVersionId: 'qv-2' });
    // qv-2 제출 1건(s-3)인데 신고 0 → 분모만 1. qv-1 미제출(s-2)은 분모에 없음은 qv-1 조회로 확인.
    expect(rate).toEqual({ uniqueReporters: 0, solvedUsers: 1 });
    const qv1 = await repo.getRate({ questionVersionId: 'qv-1' });
    expect(qv1).toEqual({ uniqueReporters: 0, solvedUsers: 1 });
    const queue = await db.prepare('SELECT COUNT(*) AS c FROM question_recheck_queue').first<{ c: number }>();
    expect(queue?.c).toBe(0);
  });
});
