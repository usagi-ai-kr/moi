import { env } from 'cloudflare:workers';
import { encrypt } from 'paseto-ts/v4';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizePasetoLocalKey } from '@/infra/auth/session/keyring';
import { sha256Hex } from '@/infra/auth/session/crypto';
import { createApp } from '@/infra/http/app';
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
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FAKE_REDIRECT_URI, applyD1Migrations } from './fixtures/kakao-fakes';

// #51 버그픽스 — study_attempts.exam_id는 공개 코드('saa-c03')로 저장되므로,
// 복습 후보·회차·시도도 같은 코드 축을 써야 한다(ADR-0058).
const db = env.DB;
const EXAM_CODE = 'saa-c03';
const EXAM_ID = 'exam-saa-c03';
const U1 = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000c1';
const QUESTIONS = ['q-1', 'q-2', 'q-3', 'q-4'];

function randomBase64Key(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const KEY = randomBase64Key();
const testEnv = {
  ...env,
  PASETO_KEY_V1: KEY,
  KAKAO_CLIENT_ID: FAKE_CLIENT_ID,
  KAKAO_CLIENT_SECRET: FAKE_CLIENT_SECRET,
  KAKAO_REDIRECT_URI: FAKE_REDIRECT_URI,
};
const app = createApp();
const NOW = () => Math.floor(Date.now() / 1000);

async function mintSession(userId: string): Promise<string> {
  const now = NOW();
  await db.prepare('INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(userId, now, now).run();
  const jti = crypto.randomUUID();
  await db
    .prepare('INSERT INTO sessions (jti_hash, user_id, issued_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256Hex(jti), userId, now, now + 3600)
    .run();
  const nowMs = Date.now();
  return encrypt(
    normalizePasetoLocalKey(KEY),
    { sub: userId, jti, iat: new Date(nowMs).toISOString(), exp: new Date(nowMs + 3600_000).toISOString() },
    { validatePayload: false },
  );
}

function req(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers['cookie'] = `__Host-moi_session=${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return app.fetch(
    new Request(`https://moi.test${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    testEnv,
  );
}

/** 학습 세트 제출과 같은 축 — 시도 exam_id는 공개 코드다(운영 D1과 동일). */
async function seed(): Promise<void> {
  const now = NOW();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(U1, now, now).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES (?1, ?2, 'SAA', ?3)").bind(EXAM_ID, EXAM_CODE, now).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', ?1, 'sec', 'sec', 100)").bind(EXAM_ID).run();
  for (const q of QUESTIONS) {
    await db
      .prepare("INSERT INTO questions (id, exam_id, domain_id, status, current_version_no, created_at, updated_at) VALUES (?1, ?2, 'd-1', 'active', 1, ?3, ?3)")
      .bind(q, EXAM_ID, now)
      .run();
    const vid = `${q}-v1`;
    await db
      .prepare("INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, ?3, 'expl', '[]', ?4, 'h', 'pending', ?5)")
      .bind(vid, q, `stem-${q}`, JSON.stringify([`${vid}-o2`]), now)
      .run();
    for (const o of ['o1', 'o2']) {
      await db.prepare('INSERT INTO question_options (id, question_version_id, option_key, text) VALUES (?1, ?2, ?3, ?4)').bind(`${vid}-${o}`, vid, o, `${o}-${q}`).run();
    }
  }
  const outcomes = ['wrong', 'pass', 'unanswered', 'wrong'];
  for (const [index, q] of QUESTIONS.entries()) {
    await db
      .prepare("INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'set', ?8, NULL, 0)")
      .bind(`a-${q}`, U1, EXAM_CODE, q, `${q}-v1`, outcomes[index], now * 1000 + index, `set-a-${q}`)
      .run();
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008, migration0009, migration0010, migration0011, migration0012]);
  try { await db.exec('PRAGMA foreign_keys = ON;'); } catch { /* pragma 미지원 시 FK 자체 검증 */ }
});

beforeEach(async () => {
  for (const t of ['study_attempts', 'review_bookmarks', 'review_sessions', 'question_options', 'question_versions', 'questions']) await db.prepare(`DELETE FROM ${t}`).run();
  for (const t of ['sessions', 'users', 'exam_domains', 'exams']) await db.prepare(`DELETE FROM ${t}`).run();
  await seed();
});

describe('복습 시험 축 정규화 (#51 버그픽스, ADR-0058)', () => {
  it('D1 소스 — 코드 축 시도를 공개 code·내부 ID 입력 모두에서 읽는다', async () => {
    const source = createD1ReviewSource(db);
    const byCode = await source.listWrongCandidates({ userId: U1, examId: EXAM_CODE });
    expect(byCode.map((r) => r.questionId).sort()).toEqual(QUESTIONS);
    const byInternalId = await source.listWrongCandidates({ userId: U1, examId: EXAM_ID });
    expect(byInternalId.map((r) => r.questionId).sort()).toEqual(QUESTIONS);
    expect(byInternalId.map((r) => r.validWrongCount).sort()).toEqual([1, 1, 1, 1]);
  });

  it('HTTP — 코드 축 시도에서 후보 조회·회차 시작·채점·이어풀기가 동작한다', async () => {
    const token = await mintSession(U1);
    const candRes = await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=wrong`, { token });
    expect(candRes.status).toBe(200);
    const cand = (await candRes.json()) as { examId: string; total: number };
    expect(cand.examId).toBe(EXAM_CODE);
    expect(cand.total).toBe(4);

    const startRes = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    expect(startRes.status).toBe(201);
    const started = (await startRes.json()) as { total: number; current: { questionId: string } };
    expect(started.total).toBe(4);

    const session = await db.prepare("SELECT exam_id FROM review_sessions WHERE user_id = ?1 AND status = 'active'").bind(U1).first<{ exam_id: string }>();
    expect(session?.exam_id).toBe(EXAM_CODE);

    const ansRes = await req('/api/review/sessions/current/answers', {
      method: 'POST',
      token,
      body: { examId: EXAM_CODE, mode: 'wrong', questionId: started.current.questionId, response: { kind: 'answered', optionIds: [`${started.current.questionId}-v1-o2`] } },
    });
    expect(ansRes.status).toBe(200);
    const attempt = await db.prepare("SELECT exam_id, source FROM study_attempts WHERE source = 'review'").first<{ exam_id: string; source: string }>();
    expect(attempt).toMatchObject({ exam_id: EXAM_CODE, source: 'review' });

    const currentRes = await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token });
    expect(currentRes.status).toBe(200);
    const current = (await currentRes.json()) as { cursor: number; total: number };
    expect(current).toMatchObject({ cursor: 1, total: 4 });
  });

  it('HTTP — 후보 1개(10개 이하)도 회차가 시작되고 채점된다', async () => {
    await db.prepare("DELETE FROM study_attempts WHERE question_id != 'q-1'").run();
    const token = await mintSession(U1);
    const startRes = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    expect(startRes.status).toBe(201);
    const started = (await startRes.json()) as { total: number; current: { questionId: string } };
    expect(started.total).toBe(1);
    const ansRes = await req('/api/review/sessions/current/answers', {
      method: 'POST',
      token,
      body: { examId: EXAM_CODE, mode: 'wrong', questionId: started.current.questionId, response: { kind: 'pass' } },
    });
    expect(ansRes.status).toBe(200);
    const currentRes = await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token });
    const current = (await currentRes.json()) as { cursor: number; exhausted: boolean };
    expect(current).toMatchObject({ cursor: 1, exhausted: true });
  });

  it('HTTP — 후보 0개일 때만 422 no_candidates', async () => {
    await db.prepare('DELETE FROM study_attempts').run();
    const token = await mintSession(U1);
    const candRes = await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=wrong`, { token });
    expect(candRes.status).toBe(200);
    expect(((await candRes.json()) as { total: number }).total).toBe(0);
    const startRes = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    expect(startRes.status).toBe(422);
    expect(await startRes.json()).toEqual({ error: 'no_candidates' });
  });
});
