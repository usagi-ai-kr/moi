import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReviewSession } from '@/domain/review/types';
import { createD1ReviewGradingRepository } from '../../src/infra/persistence/review-grading-repository';
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

// #54/#51 원자 채점 저장(ADR-0020/0025/0027/0028) — batch 원자성·CAS·firstAttempt SQL 산정을 실 D1로 증명한다.
const db = env.DB;
const NOW = 1792998000;
const repo = createD1ReviewGradingRepository(db);

function item(q: string, state: ReviewSession['items'][number]['state']): ReviewSession['items'][number] {
  return {
    questionId: q,
    questionVersionId: `${q}-v1`,
    versionNo: 1,
    optionIds: [`${q}-o1`, `${q}-o2`],
    answerOptionIds: [`${q}-o1`],
    optionOrder: [`${q}-o2`, `${q}-o1`],
    state,
  };
}
type ItemState = ReviewSession['items'][number]['state'];
const graded = (correct: boolean, pass = false): ItemState =>
  pass
    ? { kind: 'graded', response: { kind: 'pass' }, correct: false, gradedAt: NOW + 10 }
    : { kind: 'graded', response: { kind: 'answered', optionIds: correct ? ['q-1-o1'] : ['q-1-o2'] }, correct, gradedAt: NOW + 10 };
function baseSession(): ReviewSession {
  return {
    id: 'rs-1', userId: 'u-1', examId: 'e-1', mode: 'wrong', status: 'active',
    createdAt: NOW, cursor: 0,
    items: [item('q-1', { kind: 'pending' }), item('q-2', { kind: 'pending' })],
  };
}
function nextSession(over: Partial<ReviewSession> = {}): ReviewSession {
  const base = baseSession();
  return {
    ...base, cursor: 1,
    items: [item('q-1', graded(true)), item('q-2', { kind: 'pending' })],
    ...over,
  };
}
function attempt(q = 'q-1', outcome: 'correct' | 'wrong' | 'pass' = 'correct', ms = NOW * 1000 + 10) {
  return {
    attemptId: `rs-1:${q}`, userId: 'u-1', examId: 'e-1',
    questionId: q, questionVersionId: `${q}-v1`, outcome, occurredAt: ms,
  };
}
async function seedBase(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-2', NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa', 'SAA', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-2', 'sap', 'SAP', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-2', 'e-2', 'sec', 'sec', 100)").run();
  for (const [q, exam, d] of [['q-1', 'e-1', 'd-1'], ['q-2', 'e-1', 'd-1'], ['q-4', 'e-1', 'd-1'], ['q-3', 'e-2', 'd-2']] as const) {
    await db.prepare('INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES (?1, ?2, ?3, \'active\', ?4, ?4)').bind(q, exam, d, NOW).run();
    await db.prepare("INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, 's', 'e', '[]', '[]', 'h', 'pending', ?3)").bind(`${q}-v1`, q, NOW).run();
  }
}
async function seedSession(s: ReviewSession): Promise<void> {
  await db.prepare("INSERT INTO review_sessions (id, user_id, exam_id, mode, status, created_at, ended_at, cursor, items) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
    .bind(s.id, s.userId, s.examId, s.mode, s.status, s.createdAt, s.endedAt ?? null, s.cursor, JSON.stringify(s.items)).run();
}
async function loadSession(id: string) {
  return db.prepare('SELECT cursor, items FROM review_sessions WHERE id = ?1').bind(id).first<{ cursor: number; items: string }>();
}
async function countAttempts() {
  return (await db.prepare('SELECT COUNT(*) AS c FROM study_attempts').first<{ c: number }>())?.c ?? -1;
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008, migration0009, migration0010, migration0011]);
  try { await db.exec('PRAGMA foreign_keys = ON;'); } catch { /* pragma 미지원 시 FK 강제 여부 자체가 검증 대상 */ }
});
beforeEach(async () => {
  for (const t of ['study_attempts', 'review_sessions', 'question_versions', 'questions']) await db.prepare(`DELETE FROM ${t}`).run();
  for (const t of ['users', 'exam_domains', 'exams']) await db.prepare(`DELETE FROM ${t}`).run();
  await seedBase();
});

describe('review 원자 채점 저장 (#54)', () => {
  it('성공 시 회차 cursor/items와 attempt 1행을 함께 기록한다(ms·source 보존)', async () => {
    await seedSession(baseSession());
    const ok = await repo.commit({ session: nextSession(), expectedCursor: 0, attempt: attempt() });
    expect(ok).toBe(true);
    expect((await loadSession('rs-1'))?.cursor).toBe(1);
    const row = await db.prepare('SELECT source, source_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, first_attempt FROM study_attempts').first<{
      source: string; source_id: string; user_id: string; exam_id: string; question_id: string; question_version_id: string; outcome: string; occurred_at: number; first_attempt: number;
    }>();
    expect(row).toMatchObject({ source: 'review', source_id: 'rs-1', user_id: 'u-1', exam_id: 'e-1', question_id: 'q-1', question_version_id: 'q-1-v1', outcome: 'correct', occurred_at: NOW * 1000 + 10, first_attempt: 1 });
  });

  it('stale cursor·종료·다른 소유권은 false·쓰기 0건이다', async () => {
    await seedSession(baseSession());
    expect(await repo.commit({ session: nextSession(), expectedCursor: 0, attempt: attempt() })).toBe(true);
    // stale 재시도(같은 expectedCursor) — UNIQUE 숨김 없이 false
    expect(await repo.commit({ session: nextSession(), expectedCursor: 0, attempt: attempt() })).toBe(false);
    expect(await countAttempts()).toBe(1);
    // 종료 회차
    await db.prepare("UPDATE review_sessions SET status = 'ended', ended_at = ?1 WHERE id = 'rs-1'").bind(NOW + 99).run();
    const endedNext = { ...nextSession(), status: 'ended' as const, endedAt: NOW + 99, cursor: 2 };
    expect(await repo.commit({ session: endedNext, expectedCursor: 1, attempt: attempt('q-2', 'wrong') })).toBe(false);
    // 다른 소유권
    const evil = nextSession({ id: 'rs-1', userId: 'u-2' });
    expect(await repo.commit({ session: evil, expectedCursor: 0, attempt: { ...attempt(), userId: 'u-2' } })).toBe(false);
    expect(await countAttempts()).toBe(1);
  });

  it('동일 cursor 경쟁은 Promise.all 2건 중 정확히 1건만 true·attempt 1건이다', async () => {
    await seedSession(baseSession());
    const s = nextSession();
    const a1 = { ...attempt('q-1', 'correct'), attemptId: 'race-1' };
    const a2 = { ...attempt('q-1', 'correct'), attemptId: 'race-2' };
    const [r1, r2] = await Promise.all([
      repo.commit({ session: s, expectedCursor: 0, attempt: a1 }),
      repo.commit({ session: s, expectedCursor: 0, attempt: a2 }),
    ]);
    expect([r1, r2].filter(Boolean)).toHaveLength(1);
    expect(await countAttempts()).toBe(1);
    expect((await loadSession('rs-1'))?.cursor).toBe(1);
  });

  it('엉뚱한 question·버전·outcome 불일치는 저장하지 않는다', async () => {
    await seedSession(baseSession());
    const good = nextSession();
    expect(await repo.commit({ session: good, expectedCursor: 0, attempt: { ...attempt(), questionId: 'q-2' } })).toBe(false);
    expect(await repo.commit({ session: good, expectedCursor: 0, attempt: { ...attempt(), questionVersionId: 'q-1-v9' } })).toBe(false);
    expect(await repo.commit({ session: good, expectedCursor: 0, attempt: { ...attempt(), outcome: 'wrong' } })).toBe(false);
    expect(await countAttempts()).toBe(0);
    expect((await loadSession('rs-1'))?.cursor).toBe(0);
  });

  it('저장 스냅샷과 다른 문제/개정으로 바꿔치면 cursor가 맞아도 false·0건이다', async () => {
    await seedSession(baseSession()); // 저장 cursor0=q-1(q-1-v1)
    const swappedItem = item('q-2', graded(true));
    const swappedFixed: ReviewSession['items'][number] = { ...swappedItem, state: { kind: 'graded', response: { kind: 'answered', optionIds: ['q-2-o1'] }, correct: true, gradedAt: NOW + 10 } };
    const swapped: ReviewSession = { ...baseSession(), cursor: 1, items: [swappedFixed, item('q-1', { kind: 'pending' })] };
    expect(await repo.commit({ session: swapped, expectedCursor: 0, attempt: { attemptId: 'rs-1:q-2', userId: 'u-1', examId: 'e-1', questionId: 'q-2', questionVersionId: 'q-2-v1', outcome: 'correct', occurredAt: NOW * 1000 } })).toBe(false);
    // 개정 바꿔치기: 저장 v1인데 호출자는 존재하는 v2로 통일
    await db.prepare("INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES ('q-1-v2','q-1',2,'s','e','[]','[]','h','pending',?1)").bind(NOW).run();
    const v2item: ReviewSession['items'][number] = { ...item('q-1', { kind: 'pending' }), questionVersionId: 'q-1-v2', versionNo: 2, state: { kind: 'graded', response: { kind: 'answered', optionIds: ['q-1-o1'] }, correct: true, gradedAt: NOW + 10 } };
    const v2session: ReviewSession = { ...baseSession(), cursor: 1, items: [v2item, item('q-2', { kind: 'pending' })] };
    expect(await repo.commit({ session: v2session, expectedCursor: 0, attempt: { attemptId: 'rs-1:q-1v2', userId: 'u-1', examId: 'e-1', questionId: 'q-1', questionVersionId: 'q-1-v2', outcome: 'correct', occurredAt: NOW * 1000 } })).toBe(false);
    expect(await countAttempts()).toBe(0);
    expect((await loadSession('rs-1'))?.cursor).toBe(0);
  });

  it('FK 위반 시 회차도 롤백된다(세션 cursor 유지·attempt 0건)', async () => {
    const storedBad: ReviewSession = { ...baseSession(), items: [item('missing-q', { kind: 'pending' }), item('q-2', { kind: 'pending' })] };
    await seedSession(storedBad);
    const badItem = item('missing-q', graded(true));
    const badSession: ReviewSession = { ...baseSession(), cursor: 1, items: [badItem, item('q-2', { kind: 'pending' })] };
    await expect(repo.commit({
      session: badSession, expectedCursor: 0,
      attempt: { attemptId: 'rs-1:missing-q', userId: 'u-1', examId: 'e-1', questionId: 'missing-q', questionVersionId: 'missing-q-v1', outcome: 'correct', occurredAt: NOW * 1000 },
    })).rejects.toThrow();
    expect((await loadSession('rs-1'))?.cursor).toBe(0);
    expect(await countAttempts()).toBe(0);
  });

  it('UPDATE 실패 시 attempt도 롤백된다(trigger ABORT·stale no-op과 별개)', async () => {
    await seedSession(baseSession());
    await db.exec("CREATE TRIGGER trg_abort_review_update BEFORE UPDATE ON review_sessions BEGIN SELECT RAISE(ABORT, 'test trigger abort'); END;");
    try {
      await expect(repo.commit({ session: nextSession(), expectedCursor: 0, attempt: attempt() })).rejects.toThrow(/test trigger abort/);
    } finally {
      await db.exec('DROP TRIGGER IF EXISTS trg_abort_review_update;');
    }
    expect((await loadSession('rs-1'))?.cursor).toBe(0);
    expect(await countAttempts()).toBe(0);
    expect(await repo.commit({ session: nextSession(), expectedCursor: 0, attempt: attempt() })).toBe(true);
    expect(await countAttempts()).toBe(1);
  });

  it('firstAttempt는 SQL로 산정한다(중복0·pass제외·user/exam격리·excluded무시)', async () => {
    await seedSession(baseSession());
    expect(await repo.commit({ session: nextSession(), expectedCursor: 0, attempt: attempt('q-1', 'correct') })).toBe(true);
    await db.prepare("UPDATE review_sessions SET status = 'ended', ended_at = ?1 WHERE id = 'rs-1'").bind(NOW + 50).run();
    // 같은 문제 두 번째 채점 시도(새 회차 rs-2) — firstAttempt 0
    await seedSession({ ...baseSession(), id: 'rs-2' });
    const wrongGraded = item('q-1', graded(false));
    const second: ReviewSession = { ...baseSession(), id: 'rs-2', cursor: 1, items: [wrongGraded, item('q-2', { kind: 'pending' })] };
    expect(await repo.commit({ session: second, expectedCursor: 0, attempt: { ...attempt('q-1', 'wrong'), attemptId: 'rs-2:q-1' } })).toBe(true);
    const rows = await db.prepare('SELECT attempt_id, first_attempt FROM study_attempts ORDER BY occurred_at').all<{ attempt_id: string; first_attempt: number }>();
    expect(rows.results.map((r) => [r.attempt_id, r.first_attempt])).toEqual([['rs-1:q-1', 1], ['rs-2:q-1', 0]]);
    // pass는 firstAttempt false (저장 순서도 q-2 선두로 일치시킨다)
    await db.prepare("UPDATE review_sessions SET status = 'ended', ended_at = ?1 WHERE id = 'rs-2'").bind(NOW + 60).run();
    await seedSession({ ...baseSession(), id: 'rs-3', items: [item('q-2', { kind: 'pending' }), item('q-1', { kind: 'pending' })] });
    const passItem = item('q-2', { kind: 'graded', response: { kind: 'pass' }, correct: false, gradedAt: NOW + 10 });
    const passSession: ReviewSession = { ...baseSession(), id: 'rs-3', cursor: 1, items: [passItem, item('q-1', { kind: 'pending' })] };
    expect(await repo.commit({ session: passSession, expectedCursor: 0, attempt: { attemptId: 'rs-3:q-2', userId: 'u-1', examId: 'e-1', questionId: 'q-2', questionVersionId: 'q-2-v1', outcome: 'pass', occurredAt: NOW * 1000 + 20 } })).toBe(true);
    expect((await db.prepare("SELECT first_attempt AS f FROM study_attempts WHERE attempt_id = 'rs-3:q-2'").first<{ f: number }>())?.f).toBe(0);
    // pass 뒤 첫 correct는 firstAttempt 1
    await db.prepare("UPDATE review_sessions SET status = 'ended', ended_at = ?1 WHERE id = 'rs-3'").bind(NOW + 70).run();
    await seedSession({ ...baseSession(), id: 'rs-4', items: [item('q-2', { kind: 'pending' }), item('q-1', { kind: 'pending' })] });
    const correctQ2 = item('q-2', graded(true));
    // graded(true)는 q-1 optionIds이므로 q-2용으로 교정한다
    const correctQ2fixed: ReviewSession['items'][number] = { ...correctQ2, questionId: 'q-2', questionVersionId: 'q-2-v1', state: { kind: 'graded', response: { kind: 'answered', optionIds: ['q-2-o1'] }, correct: true, gradedAt: NOW + 10 } };
    const fourth: ReviewSession = { ...baseSession(), id: 'rs-4', cursor: 1, items: [correctQ2fixed, item('q-1', { kind: 'pending' })] };
    expect(await repo.commit({ session: fourth, expectedCursor: 0, attempt: { attemptId: 'rs-4:q-2', userId: 'u-1', examId: 'e-1', questionId: 'q-2', questionVersionId: 'q-2-v1', outcome: 'correct', occurredAt: NOW * 1000 + 30 } })).toBe(true);
    expect((await db.prepare("SELECT first_attempt AS f FROM study_attempts WHERE attempt_id = 'rs-4:q-2'").first<{ f: number }>())?.f).toBe(1);
    // user 격리: u-2의 같은 문제 첫 correct는 1
    await seedSession({ ...baseSession(), id: 'rs-u2', userId: 'u-2' });
    const u2session: ReviewSession = { ...nextSession(), id: 'rs-u2', userId: 'u-2' };
    expect(await repo.commit({ session: u2session, expectedCursor: 0, attempt: { ...attempt('q-1', 'correct'), attemptId: 'rs-u2:q-1', userId: 'u-2' } })).toBe(true);
    expect((await db.prepare("SELECT first_attempt AS f FROM study_attempts WHERE attempt_id = 'rs-u2:q-1'").first<{ f: number }>())?.f).toBe(1);
    // exam 격리: e-2/q-3 첫 correct는 1
    await seedSession({ id: 'rs-e2', userId: 'u-1', examId: 'e-2', mode: 'wrong', status: 'active', createdAt: NOW, cursor: 0, items: [item('q-3', { kind: 'pending' })] });
    const e2graded: ReviewSession['items'][number] = { ...item('q-3', { kind: 'pending' }), state: { kind: 'graded', response: { kind: 'answered', optionIds: ['q-3-o1'] }, correct: true, gradedAt: NOW + 10 } };
    const e2session: ReviewSession = { id: 'rs-e2', userId: 'u-1', examId: 'e-2', mode: 'wrong', status: 'active', createdAt: NOW, cursor: 1, items: [e2graded] };
    expect(await repo.commit({ session: e2session, expectedCursor: 0, attempt: { attemptId: 'rs-e2:q-3', userId: 'u-1', examId: 'e-2', questionId: 'q-3', questionVersionId: 'q-3-v1', outcome: 'correct', occurredAt: NOW * 1000 + 40 } })).toBe(true);
    expect((await db.prepare("SELECT first_attempt AS f FROM study_attempts WHERE attempt_id = 'rs-e2:q-3'").first<{ f: number }>())?.f).toBe(1);
    // excluded prior 무시: q-4 제외 correct 선행 후 새 correct는 1
    await db.prepare("INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES ('excl-1','u-1','e-1','q-4','q-4-v1','correct',?1,'set','set-x',?2,1)").bind(NOW * 1000, NOW).run();
    await db.prepare("UPDATE review_sessions SET status = 'ended', ended_at = ?1 WHERE id = 'rs-4'").bind(NOW + 80).run();
    await seedSession({ ...baseSession(), id: 'rs-5', items: [item('q-4', { kind: 'pending' }), item('q-2', { kind: 'pending' })] });
    const q4graded: ReviewSession['items'][number] = { ...item('q-4', { kind: 'pending' }), state: { kind: 'graded', response: { kind: 'answered', optionIds: ['q-4-o1'] }, correct: true, gradedAt: NOW + 10 } };
    const fifth: ReviewSession = { ...baseSession(), id: 'rs-5', cursor: 1, items: [q4graded, item('q-2', { kind: 'pending' })] };
    expect(await repo.commit({ session: fifth, expectedCursor: 0, attempt: { attemptId: 'rs-5:q-4', userId: 'u-1', examId: 'e-1', questionId: 'q-4', questionVersionId: 'q-4-v1', outcome: 'correct', occurredAt: NOW * 1000 + 50 } })).toBe(true);
    expect((await db.prepare("SELECT first_attempt AS f FROM study_attempts WHERE attempt_id = 'rs-5:q-4'").first<{ f: number }>())?.f).toBe(1);
  });
});
