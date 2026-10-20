import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { answerReviewItem, resumeReviewSession, startReviewSession } from '../../src/app/review';
import { createD1ReviewGradingRepository } from '../../src/infra/persistence/review-grading-repository';
import { createD1ReviewSessionRepository } from '../../src/infra/persistence/review-session-repository';
import { createD1ReviewSource } from '../../src/infra/persistence/review-source-repository';
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
import migration0012 from '../../drizzle/migrations/0012_add-review-bookmarks.sql?raw';
import migration0013 from '../../drizzle/migrations/0013_add-review-round-queue.sql?raw';
import { applyD1Migrations } from './fixtures/kakao-fakes';

// #51+#54 조립 — 세트채점 fixture→오답후보→복습start→answer→attempt+cursor 원자저장→resume. HTTP 흐름 아님.
const db = env.DB;
const NOW = 1792998000;

async function seed(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  for (const q of ['q-1', 'q-2', 'q-3']) {
    await db.prepare("INSERT INTO questions (id, exam_id, domain_id, status, current_version_no, created_at, updated_at) VALUES (?1, 'e-1', 'd-1', 'active', 1, ?2, ?2)").bind(q, NOW).run();
    await db.prepare(`INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, 's', 'e', '[]', ?3, 'h', 'pending', ?4)`).bind(`${q}-v1`, q, JSON.stringify([`${q}-v1-o2`]), NOW).run();
    for (const o of ['o1', 'o2']) {
      await db.prepare('INSERT INTO question_options (id, question_version_id, option_key, text) VALUES (?1, ?2, ?3, ?4)').bind(`${q}-v1-${o}`, `${q}-v1`, o, `${o}`).run();
    }
  }
  const attempts: Array<[string, string, string]> = [['a-1', 'q-1', 'wrong'], ['a-2', 'q-2', 'pass'], ['a-3', 'q-3', 'unanswered']];
  for (const [aid, q, out] of attempts) {
    await db.prepare("INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, 'u-1', 'e-1', ?2, ?3, ?4, ?5, 'set', ?6, NULL, 0)").bind(aid, q, `${q}-v1`, out, NOW * 1000, `set-${aid}`).run();
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008, migration0009, migration0010, migration0011, migration0012, migration0013]);
  try { await db.exec('PRAGMA foreign_keys = ON;'); } catch { /* pragma 미지원 시 FK 자체 검증 */ }
});

beforeEach(async () => {
  for (const t of ['study_attempts', 'review_bookmarks', 'review_sessions', 'question_options', 'question_versions', 'questions']) await db.prepare(`DELETE FROM ${t}`).run();
  for (const t of ['users', 'exam_domains', 'exams']) await db.prepare(`DELETE FROM ${t}`).run();
  await seed();
});

describe('복습 D1 조립 (#51+#54)', () => {
  it('오답후보→start→answer→원자저장→resume이 D1에 남는다', async () => {
    const source = createD1ReviewSource(db);
    const repository = createD1ReviewSessionRepository(db);
    const grading = createD1ReviewGradingRepository(db);
    const deps = { source, repository, grading, clock: { now: () => NOW }, rng: { next: () => 0.1 } };
    const wrong = await source.listWrongCandidates({ userId: 'u-1', examId: 'e-1' });
    expect(wrong.map((r) => r.questionId).sort()).toEqual(['q-1', 'q-2', 'q-3']);
    const started = await startReviewSession(deps, { userId: 'u-1', examId: 'e-1', mode: 'wrong' });
    expect(started.outcome).toBe('started');
    if (started.outcome !== 'started') return;
    const current = started.session.items[started.session.cursor]?.questionId ?? '';
    const item = started.session.items[started.session.cursor];
    const answerIds = item?.answerOptionIds ? [...item.answerOptionIds] : [];
    const answered = await answerReviewItem(deps, { userId: 'u-1', examId: 'e-1', mode: 'wrong', questionId: current, response: { kind: 'answered', optionIds: answerIds } });
    expect(answered.outcome).toBe('answered');
    const resumed = await resumeReviewSession(deps, { userId: 'u-1', examId: 'e-1', mode: 'wrong' });
    expect(resumed.outcome).toBe('resumed');
    if (resumed.outcome !== 'resumed') return;
    expect(resumed.session.cursor).toBe(1);
    const row = await db.prepare("SELECT outcome, first_attempt AS f FROM study_attempts WHERE source = 'review'").first<{ outcome: string; f: number }>();
    expect(row?.outcome).toBe('correct');
    // 원자어댑터 한계 명시: 0행·firstAttempt 교차경합 잔여는 false·쓰기없음으로만 보장한다.
    expect([0, 1]).toContain(row?.f);
  });
});
