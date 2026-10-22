import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

// #51 D1 복습 소스·북마크 (wrong/pass/unanswered 집계·excluded 제외·격리·현행버전)
const db = env.DB;
const NOW = 1792998000;
const source = createD1ReviewSource(db);

async function seedBase(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-2', NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-2', 'sap', 'SAP', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-2', 'e-2', 'sec', 'sec', 100)").run();
  const qs: Array<[string, string, string, number | null]> = [
    ['q-wrong', 'e-1', 'active', 1],
    ['q-pass', 'e-1', 'active', 1],
    ['q-unans', 'e-1', 'active', 1],
    ['q-correct', 'e-1', 'active', 1],
    ['q-excl', 'e-1', 'active', 1],
    ['q-inactive', 'e-1', 'inactive', 1],
    ['q-other', 'e-2', 'active', 1],
    ['q-v2', 'e-1', 'active', 2],
  ];
  for (const [q, exam, status, cur] of qs) {
    await db.prepare('INSERT INTO questions (id, exam_id, domain_id, status, current_version_no, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)').bind(q, exam, exam === 'e-1' ? 'd-1' : 'd-2', status, cur, NOW).run();
  }
  const versions: Array<[string, string, number, string]> = [
    ['q-wrong-v1', 'q-wrong', 1, '["o2"]'],
    ['q-pass-v1', 'q-pass', 1, '["o2"]'],
    ['q-unans-v1', 'q-unans', 1, '["o2"]'],
    ['q-correct-v1', 'q-correct', 1, '["o2"]'],
    ['q-excl-v1', 'q-excl', 1, '["o2"]'],
    ['q-inactive-v1', 'q-inactive', 1, '["o2"]'],
    ['q-other-v1', 'q-other', 1, '["o2"]'],
    ['q-v2-v1', 'q-v2', 1, '["o1"]'],
    ['q-v2-v2', 'q-v2', 2, '["o2"]'],
  ];
  for (const [id, q, no, ans] of versions) {
    await db.prepare(`INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, ?3, 's', 'e', '[]', ?4, 'h', 'pending', ?5)`).bind(id, q, no, ans, NOW).run();
    for (const o of ['o1', 'o2']) {
      await db.prepare('INSERT INTO question_options (id, question_version_id, option_key, text) VALUES (?1, ?2, ?3, ?4)').bind(`${id}-${o}`, id, o, `${o}-text`).run();
    }
  }
}

async function seedAttempts(): Promise<void> {
  const rows: Array<[string, string, string, string, string, string, number, number | null]> = [
    ['a-w1', 'u-1', 'e-1', 'q-wrong', 'q-wrong-v1', 'wrong', NOW * 1000, null],
    ['a-p1', 'u-1', 'e-1', 'q-pass', 'q-pass-v1', 'pass', NOW * 1000 + 1, null],
    ['a-u1', 'u-1', 'e-1', 'q-unans', 'q-unans-v1', 'unanswered', NOW * 1000 + 2, null],
    ['a-c1', 'u-1', 'e-1', 'q-correct', 'q-correct-v1', 'correct', NOW * 1000 + 3, null],
    ['a-x1', 'u-1', 'e-1', 'q-excl', 'q-excl-v1', 'wrong', NOW * 1000 + 4, NOW],
    ['a-i1', 'u-1', 'e-1', 'q-inactive', 'q-inactive-v1', 'wrong', NOW * 1000 + 5, null],
    ['a-o1', 'u-1', 'e-2', 'q-other', 'q-other-v1', 'wrong', NOW * 1000 + 6, null],
    ['a-u2', 'u-2', 'e-1', 'q-wrong', 'q-wrong-v1', 'wrong', NOW * 1000 + 7, null],
    ['a-v2', 'u-1', 'e-1', 'q-v2', 'q-v2-v1', 'wrong', NOW * 1000 + 8, null],
  ];
  for (const [aid, u, e, q, qv, out, at, excl] of rows) {
    await db.prepare("INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'set', ?8, ?9, 0)").bind(aid, u, e, q, qv, out, at, `set-${aid}`, excl).run();
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008, migration0009, migration0010, migration0011, migration0012, migration0013]);
  try { await db.exec('PRAGMA foreign_keys = ON;'); } catch { /* pragma 미지원 시 FK 자체 검증 */ }
});

beforeEach(async () => {
  for (const t of ['study_attempts', 'review_bookmarks', 'review_sessions', 'question_options', 'question_versions', 'questions']) await db.prepare(`DELETE FROM ${t}`).run();
  for (const t of ['users', 'exam_domains', 'exams']) await db.prepare(`DELETE FROM ${t}`).run();
  await seedBase();
  await seedAttempts();
});

describe('D1 복습 소스 (#51)', () => {
  it('wrong+pass+unanswered를 집계하고 correct·excluded·비활성은 제외한다', async () => {
    const rows = await source.listWrongCandidates({ userId: 'u-1', examId: 'e-1' });
    const ids = rows.map((r) => r.questionId).sort();
    expect(ids).toEqual(['q-pass', 'q-unans', 'q-v2', 'q-wrong']);
    expect(rows.find((r) => r.questionId === 'q-wrong')).toMatchObject({ validWrongCount: 1 });
  });

  it('서로 다른 user/exam 격리 — u-2/e-2는 각자 목록만 본다', async () => {
    expect((await source.listWrongCandidates({ userId: 'u-2', examId: 'e-1' })).map((r) => r.questionId).sort()).toEqual(['q-wrong']);
    expect((await source.listWrongCandidates({ userId: 'u-1', examId: 'e-2' })).map((r) => r.questionId)).toEqual(['q-other']);
    expect(await source.listWrongCandidates({ userId: 'u-1', examId: 'missing' })).toEqual([]);
  });

  it('최신 활성 버전 매핑 — q-v2는 v2 스냅샷·정답 o2·보기 o1/o2', async () => {
    const rows = await source.listWrongCandidates({ userId: 'u-1', examId: 'e-1' });
    const v2 = rows.find((r) => r.questionId === 'q-v2');
    expect(v2?.version).toMatchObject({ questionVersionId: 'q-v2-v2', versionNo: 2, answerOptionIds: ['o2'] });
    expect([...(v2?.version.optionIds ?? [])].sort()).toEqual(['q-v2-v2-o1', 'q-v2-v2-o2']);
  });

  it('오답 후 정답 문항은 후보에서 제외한다 (최신 유효 시도 기준)', async () => {
    await db
      .prepare("INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, ?2, ?3, ?4, ?5, 'correct', ?6, 'set', ?7, NULL, 0)")
      .bind('a-w1-correct', 'u-1', 'e-1', 'q-wrong', 'q-wrong-v1', NOW * 1000 + 100, 'set-a-w1-correct')
      .run();
    const rows = await source.listWrongCandidates({ userId: 'u-1', examId: 'e-1' });
    const ids = rows.map((r) => r.questionId);
    expect(ids).not.toContain('q-wrong');
  });

  it('정답 후 재오답 문항은 다시 후보에 포함된다', async () => {
    await db
      .prepare("INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, ?2, ?3, ?4, ?5, 'wrong', ?6, 'set', ?7, NULL, 0)")
      .bind('a-c1-wrong', 'u-1', 'e-1', 'q-correct', 'q-correct-v1', NOW * 1000 + 100, 'set-a-c1-wrong')
      .run();
    const rows = await source.listWrongCandidates({ userId: 'u-1', examId: 'e-1' });
    const ids = rows.map((r) => r.questionId);
    expect(ids).toContain('q-correct');
  });

  it('북마크 추가·해제·목록 — 개인별 독립·UNIQUE·중복토글·타사용자 보존', async () => {
    expect(await source.listBookmarkCandidates({ userId: 'u-1', examId: 'e-1' })).toEqual([]);
    expect(await source.toggleBookmark({ userId: 'u-1', questionId: 'q-wrong' })).toEqual({ bookmarked: true });
    expect(await source.toggleBookmark({ userId: 'u-1', questionId: 'q-wrong' })).toEqual({ bookmarked: false });
    await source.toggleBookmark({ userId: 'u-1', questionId: 'q-wrong' });
    await source.toggleBookmark({ userId: 'u-2', questionId: 'q-wrong' });
    const u1 = await source.listBookmarkCandidates({ userId: 'u-1', examId: 'e-1' });
    expect(u1.map((r) => r.questionId)).toEqual(['q-wrong']);
    await source.toggleBookmark({ userId: 'u-1', questionId: 'q-wrong' });
    expect(await source.listBookmarkCandidates({ userId: 'u-1', examId: 'e-1' })).toEqual([]);
    expect((await source.listBookmarkCandidates({ userId: 'u-2', examId: 'e-1' })).map((r) => r.questionId)).toEqual(['q-wrong']);
  });

  it('존재하지 않는 문제 토글은 거부·시험격리 — e-2 북마크는 e-1에 안 보인다', async () => {
    await expect(source.toggleBookmark({ userId: 'u-1', questionId: 'missing-q' })).rejects.toThrow();
    await source.toggleBookmark({ userId: 'u-1', questionId: 'q-other' });
    expect(await source.listBookmarkCandidates({ userId: 'u-1', examId: 'e-1' })).toEqual([]);
    expect((await source.listBookmarkCandidates({ userId: 'u-1', examId: 'e-2' })).map((r) => r.questionId)).toEqual(['q-other']);
  });
});
