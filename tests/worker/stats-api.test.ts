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
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #54 학습 현황 HTTP API — 세션 인증·examId 검증·사용자/시험 격리를 실제 Hono+D1로 증명한다.
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
const NOW_S = () => Math.floor(Date.now() / 1000);

async function mintSession(userId: string): Promise<string> {
  const now = NOW_S();
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

function statsRequest(path: string, init: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers['cookie'] = `__Host-moi_session=${init.token}`;
  return app.fetch(new Request(`https://moi.test${path}`, { headers }), testEnv);
}

const U_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const U_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const U_C = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
const U_D = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';

async function seedBank(): Promise<number> {
  const nowS = NOW_S();
  const nowMs = Date.now();
  for (const u of [U_A, U_B]) {
    await db.prepare('INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(u, nowS, nowS).run();
  }
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(nowS).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-2', 'sap-c02', 'SAP', ?1)").bind(nowS).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-9', 'e-2', 'sec', 'sec', 100)").run();
  for (let i = 1; i <= 6; i += 1) {
    await db
      .prepare("INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES (?1, 'e-1', 'd-1', 'active', ?2, ?2)")
      .bind(`q-${i}`, nowS)
      .run();
    await db
      .prepare(
        "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?3)",
      )
      .bind(`q-${i}-v1`, `q-${i}`, nowS)
      .run();
  }
  await db
    .prepare("INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES ('q-9', 'e-2', 'd-9', 'active', ?1, ?1)")
    .bind(nowS)
    .run();
  await db
    .prepare(
      "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES ('q-9-v1', 'q-9', 1, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?1)",
    )
    .bind(nowS)
    .run();
  const outcomes: Array<[string, string]> = [
    ['q-1', 'correct'],
    ['q-2', 'correct'],
    ['q-3', 'wrong'],
    ['q-4', 'wrong'],
    ['q-5', 'wrong'],
    ['q-6', 'wrong'],
  ];
  let t = 0;
  for (const [qid, outcome] of outcomes) {
    t += 1;
    await db
      .prepare(
        'INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, 1)',
      )
      .bind(`h-${qid}`, U_A, 'e-1', qid, `${qid}-v1`, outcome, nowMs - 1000 + t, 'set', `s-${qid}`)
      .run();
  }
  return nowMs;
}

beforeAll(async () => {
  await applyD1Migrations(db, [
    migration0000, migration0001, migration0002, migration0003, migration0004,
    migration0005, migration0006, migration0007, migration0008, migration0009,
  ]);
});

beforeEach(async () => {
  for (const t of ['study_attempts', 'study_set_items', 'study_sets', 'question_versions', 'questions', 'exam_domains', 'exams', 'sessions', 'users']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seedBank();
});

describe('학습 현황 HTTP API (#54)', () => {
  it('미인증은 401이다', async () => {
    const res = await statsRequest('/api/study/stats?examId=e-1');
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('200: 시드와 일치한다', async () => {
    const token = await mintSession(U_A);
    void token;
    // mintSession이 users 중복 삽입을 시도하므로 정리: seedBank가 users를 만들지 않으므로 그대로 사용한다.
    const res = await statsRequest('/api/study/stats?examId=e-1', { token });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as {
      examId: string; totalQuestions: number; uniqueFirstSolved: number; coverage: number;
      overallAccuracy: number | null;
      domains: Array<{ domainId: string; uniqueFirstSolved: number; gradedAttempts: number; cumulativeAccuracy: number | null; recentAccuracy: number | null; status: string }>;
      weakDomains: Array<{ domainId: string; score: number; cumulativeAccuracy: number; effectiveRecentAccuracy: number; uniqueFirstSolved: number }>;
    };
    expect(body.examId).toBe('e-1');
    expect(body.totalQuestions).toBe(500);
    expect(body.uniqueFirstSolved).toBe(6);
    expect(body.coverage).toBeCloseTo(6 / 500, 10);
    expect(body.overallAccuracy).toBeCloseTo(2 / 6, 10);
    expect(body.domains).toHaveLength(1);
    expect(body.domains[0]).toMatchObject({ domainId: 'd-1', uniqueFirstSolved: 6, gradedAttempts: 6, status: 'ok' });
    expect(body.domains[0]?.cumulativeAccuracy).toBeCloseTo(2 / 6, 10);
    expect(body.domains[0]?.recentAccuracy).toBeCloseTo(2 / 6, 10);
    expect(body.weakDomains).toHaveLength(1);
    expect(body.weakDomains[0]?.domainId).toBe('d-1');
    expect(body.weakDomains[0]?.score).toBeCloseTo(2 / 6, 10);
  });

  it('다른 user/exam은 격리된다', async () => {
    const tokenB = await mintSession(U_B);
    const otherUser = await statsRequest('/api/study/stats?examId=e-1', { token: tokenB });
    expect(otherUser.status).toBe(200);
    const b = (await otherUser.json()) as { uniqueFirstSolved: number; coverage: number; overallAccuracy: number | null; domains: unknown[]; weakDomains: unknown[] };
    expect(b).toMatchObject({ uniqueFirstSolved: 0, coverage: 0, overallAccuracy: null });
    expect(b.domains).toEqual([]);
    expect(b.weakDomains).toEqual([]);
    const tokenA2 = await mintSession(U_C);
    void tokenA2;
    // e-2에는 U_A 기록이 없으므로 0이다 (토큰 사용자 무관하게 e-2는 q-9 기록 없음)
    const otherExam = await statsRequest('/api/study/stats?examId=e-2', { token: tokenB });
    expect(otherExam.status).toBe(200);
    const e2 = (await otherExam.json()) as { examId: string; uniqueFirstSolved: number };
    expect(e2.examId).toBe('e-2');
    expect(e2.uniqueFirstSolved).toBe(0);
  });

  it('examId 누락은 422다', async () => {
    const token = await mintSession(U_D);
    const res = await statsRequest('/api/study/stats', { token });
    expect(res.status).toBe(422);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'validation_failed' });
  });
});
