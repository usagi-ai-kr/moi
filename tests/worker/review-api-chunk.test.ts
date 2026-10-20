import { env } from 'cloudflare:workers';
import { encrypt } from 'paseto-ts/v4';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizePasetoLocalKey } from '@/infra/auth/session/keyring';
import { sha256Hex } from '@/infra/auth/session/crypto';
import { createApp } from '@/infra/http/app';
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

// D1 bind 상한 회귀 — 120 후보(questions/versions/options 전체 chunk) 실제 Worker 경로.
const db = env.DB;

function randomBase64Key(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const KEY = randomBase64Key();
const testEnv = { ...env, PASETO_KEY_V1: KEY };
const app = createApp();
const NOW = () => Math.floor(Date.now() / 1000);
const U_BIG = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000eb';

async function mintSession(userId: string): Promise<string> {
  const now = NOW();
  await db.prepare('INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(userId, now, now).run();
  const jti = crypto.randomUUID();
  await db.prepare('INSERT INTO sessions (jti_hash, user_id, issued_at, expires_at) VALUES (?1, ?2, ?3, ?4)').bind(await sha256Hex(jti), userId, now, now + 3600).run();
  const nowMs = Date.now();
  return encrypt(normalizePasetoLocalKey(KEY), { sub: userId, jti, iat: new Date(nowMs).toISOString(), exp: new Date(nowMs + 3600_000).toISOString() }, { validatePayload: false });
}

function req(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers['cookie'] = `__Host-moi_session=${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return app.fetch(new Request(`https://moi.test${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }), testEnv);
}

async function seed120(): Promise<void> {
  const now = NOW();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(U_BIG, now, now).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-big', 'saa-c03', 'SAA', ?1)").bind(now).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-big', 'e-big', 'sec', 'sec', 100)").run();
  for (let i = 0; i < 120; i += 1) {
    const q = `bq-${i}`;
    await db.prepare("INSERT INTO questions (id, exam_id, domain_id, status, current_version_no, created_at, updated_at) VALUES (?1, 'e-big', 'd-big', 'active', 1, ?2, ?2)").bind(q, now).run();
    const vid = `${q}-v1`;
    await db.prepare("INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, ?3, ?4, '[]', ?5, 'h', 'pending', ?6)")
      .bind(vid, q, `stem-${q}`, `expl-${q}`, JSON.stringify([`${vid}-o2`]), now).run();
    for (const o of ['o1', 'o2']) {
      await db.prepare('INSERT INTO question_options (id, question_version_id, option_key, text) VALUES (?1, ?2, ?3, ?4)').bind(`${vid}-${o}`, vid, o, `${o}-${q}`).run();
    }
    await db.prepare("INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, ?2, 'e-big', ?3, ?4, 'wrong', ?5, 'set', ?6, NULL, 0)")
      .bind(`ba-${i}`, U_BIG, q, vid, now * 1000 + i, `set-ba-${i}`).run();
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008, migration0009, migration0010, migration0011, migration0012, migration0013]);
  try { await db.exec('PRAGMA foreign_keys = ON;'); } catch { /* noop */ }
});

beforeEach(async () => {
  for (const t of ['study_attempts', 'review_bookmarks', 'review_sessions', 'question_options', 'question_versions', 'questions']) await db.prepare(`DELETE FROM ${t}`).run();
  for (const t of ['sessions', 'users', 'exam_domains', 'exams']) await db.prepare(`DELETE FROM ${t}`).run();
  await seed120();
});

describe('복습 D1 바인드 상한 (120 후보)', () => {
  it('후보 120 조회·시작·첫채점이 bind 상한 없이 성공한다', async () => {
    const token = await mintSession(U_BIG);
    const candRes = await req('/api/review/candidates?examId=saa-c03&mode=wrong', { token });
    expect(candRes.status).toBe(200);
    const cand = (await candRes.json()) as { total: number };
    expect(cand.total).toBe(120);
    const startRes = await req('/api/review/sessions', { method: 'POST', token, body: { examId: 'saa-c03', mode: 'wrong' } });
    expect(startRes.status).toBe(201);
    const started = (await startRes.json()) as { total: number; current: { questionId: string } };
    expect(started.total).toBe(10);
    const qid = started.current.questionId;
    const ans = await req('/api/review/sessions/current/answers', { method: 'POST', token, body: { examId: 'saa-c03', mode: 'wrong', questionId: qid, response: { kind: 'pass' } } });
    expect(ans.status).toBe(200);
  });
});
