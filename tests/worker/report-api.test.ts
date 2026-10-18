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
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #53 신고 HTTP API Worker+D1 통합 테스트 — 세션 인증·본문 검증·버전 일치 확인·
// 201 recorded/200 duplicate·신고율·고유 신고자 증가를 실제 Hono+D1로 증명한다.

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

async function mintSession(userId: string): Promise<string> {
  const now = NOW();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(userId, now, now).run();
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

function reportRequest(path: string, init: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers['cookie'] = `__Host-moi_session=${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return app.fetch(
    new Request(`https://moi.test${path}`, {
      method: 'POST',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    testEnv,
  );
}

const U_A = '11111111-1111-4111-8111-111111111111';
const U_B = '22222222-2222-4222-8222-222222222222';

/** q-1/qv-1(존재)·q-1/qv-2(존재)·q-9/qv-9(부재) 대응을 위해 버전 2개를 심는다. */
async function seedQuestions(): Promise<void> {
  const now = NOW();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(now).run();
  await db
    .prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)")
    .run();
  await db
    .prepare(
      "INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES ('q-1', 'e-1', 'd-1', 'active', ?1, ?1)",
    )
    .bind(now)
    .run();
  for (const [id, no] of [['qv-1', 1], ['qv-2', 2]] as const) {
    await db
      .prepare(
        "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, 'q-1', ?2, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?3)",
      )
      .bind(id, no, now)
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
  ]);
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 테스트가 실제 강제 여부를 드러낸다.
  }
});

beforeEach(async () => {
  for (const t of [
    'question_recheck_queue',
    'question_reports',
    'study_set_items',
    'study_sets',
    'question_versions',
    'questions',
    'audit_logs',
    'exam_domains',
    'exams',
    'sessions',
    'users',
  ]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seedQuestions();
});

async function count(sql: string, bind: string[] = []): Promise<number> {
  const row = await db.prepare(sql).bind(...bind).first<{ c: number }>();
  return Number(row?.c ?? 0);
}

describe('신고 HTTP API (#53)', () => {
  it('미인증은 401이다', async () => {
    const res = await reportRequest('/api/study/reports', {
      body: { questionId: 'q-1', questionVersionId: 'qv-1', reason: 'typo' },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('유효 신고 201 + queue 1행 + rate, 같은 user 재신고 200 duplicate', async () => {
    const token = await mintSession(U_A);
    const first = await reportRequest('/api/study/reports', {
      token,
      body: { questionId: 'q-1', questionVersionId: 'qv-1', reason: 'typo' },
    });
    expect(first.status).toBe(201);
    expect(first.headers.get('cache-control')).toBe('no-store');
    const body = (await first.json()) as {
      outcome: string;
      uniqueReporters: number;
      solvedUsers: number;
      rate: number | null;
      autoStop: boolean;
      requiresRecheck: boolean;
    };
    expect(body).toMatchObject({ outcome: 'recorded', uniqueReporters: 1, solvedUsers: 0, rate: null, requiresRecheck: true });
    expect(await count('SELECT COUNT(*) AS c FROM question_recheck_queue')).toBe(1);
    expect(await count('SELECT COUNT(*) AS c FROM question_reports')).toBe(1);

    const dup = await reportRequest('/api/study/reports', {
      token,
      body: { questionId: 'q-1', questionVersionId: 'qv-1', reason: 'answer' },
    });
    expect(dup.status).toBe(200);
    expect(await dup.json()).toEqual({ outcome: 'duplicate' });
    expect(await count('SELECT COUNT(*) AS c FROM question_reports')).toBe(1);
    expect(await count('SELECT COUNT(*) AS c FROM question_recheck_queue')).toBe(1);
  });

  it('잘못된 reason 422, 없는 question/version 422 invalid_question', async () => {
    const token = await mintSession(U_A);
    const badReason = await reportRequest('/api/study/reports', {
      token,
      body: { questionId: 'q-1', questionVersionId: 'qv-1', reason: 'nonsense' },
    });
    expect(badReason.status).toBe(422);
    expect((await badReason.json()) as { error: string }).toMatchObject({ error: 'validation_failed' });

    const missingVersion = await reportRequest('/api/study/reports', {
      token,
      body: { questionId: 'q-1', questionVersionId: 'qv-9', reason: 'typo' },
    });
    expect(missingVersion.status).toBe(422);
    expect((await missingVersion.json()) as { error: string }).toMatchObject({ error: 'invalid_question' });

    const mismatchedQuestion = await reportRequest('/api/study/reports', {
      token,
      body: { questionId: 'q-9', questionVersionId: 'qv-1', reason: 'typo' },
    });
    expect(mismatchedQuestion.status).toBe(422);
    expect((await mismatchedQuestion.json()) as { error: string }).toMatchObject({ error: 'invalid_question' });
    expect(await count('SELECT COUNT(*) AS c FROM question_reports')).toBe(0);
  });

  it('다른 user 신고 시 uniqueReporters가 증가한다', async () => {
    const tokenA = await mintSession(U_A);
    const tokenB = await mintSession(U_B);
    const first = await reportRequest('/api/study/reports', {
      token: tokenA,
      body: { questionId: 'q-1', questionVersionId: 'qv-1', reason: 'typo' },
    });
    expect(first.status).toBe(201);
    const second = await reportRequest('/api/study/reports', {
      token: tokenB,
      body: { questionId: 'q-1', questionVersionId: 'qv-1', reason: 'ambiguous' },
    });
    expect(second.status).toBe(201);
    const body = (await second.json()) as { uniqueReporters: number; solvedUsers: number };
    expect(body.uniqueReporters).toBe(2);
    expect(await count('SELECT COUNT(*) AS c FROM question_reports')).toBe(2);
    expect(await count('SELECT COUNT(*) AS c FROM question_recheck_queue')).toBe(1);
  });

  it('제출 세트가 있으면 rate가 분모를 반영한다', async () => {
    const tokenA = await mintSession(U_A);
    const solver = await mintSession(U_B);
    expect(solver).toBeTruthy();
    const now = NOW();
    await db
      .prepare("INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at, submitted_at) VALUES ('s-1', ?1, 'e-1', 'all', 'submitted', ?2, ?2)")
      .bind(U_B, now)
      .run();
    await db
      .prepare(
        "INSERT INTO study_set_items (set_id, question_id, question_version_id, version_no, option_order, answer_option_ids) VALUES ('s-1', 'q-1', 'qv-1', 1, '[]', '[]')",
      )
      .run();
    const res = await reportRequest('/api/study/reports', {
      token: tokenA,
      body: { questionId: 'q-1', questionVersionId: 'qv-1', reason: 'answer' },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { uniqueReporters: number; solvedUsers: number; rate: number | null };
    expect(body).toMatchObject({ uniqueReporters: 1, solvedUsers: 1, rate: 1 });
  });
});
