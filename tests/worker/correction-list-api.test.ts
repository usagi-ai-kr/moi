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
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #53 완료 세트 정정 이력 조회 API — 세션 인증·소유 확인·정정 목록 정렬을 실제 Hono+D1로 증명한다.
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
const NOW = 1792320000;
const U_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const U_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

async function mintSession(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
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

function listRequest(setId: string, init: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers['cookie'] = `__Host-moi_session=${init.token}`;
  return app.fetch(new Request(`https://moi.test/api/study/sets/${setId}/corrections`, { headers }), testEnv);
}

async function seed(): Promise<void> {
  for (const u of [U_A, U_B]) {
    await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(u, NOW, NOW).run();
  }
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  for (const q of ['q-1', 'q-2']) {
    await db
      .prepare("INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES (?1, 'e-1', 'd-1', 'active', ?2, ?2)")
      .bind(q, NOW)
      .run();
    await db
      .prepare(
        "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?3)",
      )
      .bind(`${q}-v1`, q, NOW)
      .run();
  }
  for (const [id, userId] of [['set-1', U_A], ['set-empty', U_A]] as const) {
    await db
      .prepare("INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at, submitted_at) VALUES (?1, ?2, 'e-1', 'all', 'submitted', ?3, ?3)")
      .bind(id, userId, NOW)
      .run();
  }
  await db
    .prepare(
      "INSERT INTO study_corrections (id, set_id, question_id, question_version_id, reason, source, actor, created_at) VALUES ('c-b', 'set-1', 'q-2', 'q-2-v1', 'typo', 'admin', 'admin-1', ?1)",
    )
    .bind(NOW + 5)
    .run();
  await db
    .prepare(
      "INSERT INTO study_corrections (id, set_id, question_id, question_version_id, reason, source, actor, created_at) VALUES ('c-a', 'set-1', 'q-1', 'q-1-v1', 'answer-changed', 'recheck', 'system', ?1)",
    )
    .bind(NOW + 5)
    .run();
}

beforeAll(async () => {
  await applyD1Migrations(db, [
    migration0000, migration0001, migration0002, migration0003, migration0004,
    migration0005, migration0006, migration0007, migration0008, migration0009, migration0010,
  ]);
});

beforeEach(async () => {
  for (const t of ['study_corrections', 'study_set_items', 'study_sets', 'study_attempts', 'question_versions', 'questions', 'exam_domains', 'exams', 'sessions', 'users']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seed();
});

describe('완료 세트 정정 이력 조회 API (#53)', () => {
  it('미인증은 401이다', async () => {
    const res = await listRequest('set-1');
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('소유자는 200·정정 2건(createdAt/id 정렬)', async () => {
    const token = await mintSession(U_A);
    const res = await listRequest('set-1', { token });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { items: Array<{ id: string; setId: string; createdAt: number }> };
    expect(body.items.map((i) => i.id)).toEqual(['c-a', 'c-b']);
    expect(body.items[0]).toMatchObject({ id: 'c-a', setId: 'set-1', createdAt: NOW + 5 });
  });

  it('다른 사용자의 세트는 404다', async () => {
    const token = await mintSession(U_B);
    const res = await listRequest('set-1', { token });
    expect(res.status).toBe(404);
  });

  it('없는 세트는 404다', async () => {
    const token = await mintSession(U_A);
    expect((await listRequest('missing-set', { token })).status).toBe(404);
  });

  it('정정이 없으면 빈 배열이다', async () => {
    const token = await mintSession(U_A);
    const res = await listRequest('set-empty', { token });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });
});
