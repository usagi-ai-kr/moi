import { env } from 'cloudflare:workers';
import { encrypt } from 'paseto-ts/v4';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizePasetoLocalKey } from '@/infra/auth/session/keyring';
import { sha256Hex } from '@/infra/auth/session/crypto';
import { createApp } from '@/infra/http/app';
import { createD1QuestionBankRepository } from '@/infra/persistence/d1-question-bank-repository';
import migration0000 from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import migration0001 from '../../drizzle/migrations/0001_add-users-external-identities.sql?raw';
import migration0002 from '../../drizzle/migrations/0002_add-sessions.sql?raw';
import migration0003 from '../../drizzle/migrations/0003_add-question-bank.sql?raw';
import migration0004 from '../../drizzle/migrations/0004_add-admin-api.sql?raw';
import migration0005 from '../../drizzle/migrations/0005_add-study-sets.sql?raw';
import migration0006 from '../../drizzle/migrations/0006_add-study-item-content.sql?raw';
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #49 후속 (ADR-0020) Worker+D1 통합 테스트 — 세션 인증·세트 생명주기·
// 스냅샷 채점·동시 시작 가드·페이지네이션을 실제 Hono+D1로 증명한다.

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

function studyRequest(
  path: string,
  init: { method?: string; token?: string; body?: unknown; query?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers['cookie'] = `__Host-moi_session=${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return app.fetch(
    new Request(`https://moi.test${path}${init.query ?? ''}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    testEnv,
  );
}

const EXAM = 'saa-c03';
const SMALL_EXAM = 'small-exam';

async function seedBank(questionCount = 24, examId = EXAM): Promise<void> {
  const questions = createD1QuestionBankRepository(db);
  await questions.insertExam({ id: `exam-${examId}`, code: examId, name: examId, now: NOW() });
  await questions.insertDomain({ id: `dom-${examId}-sec`, examId: `exam-${examId}`, code: 'security', name: '보안', weight: 60 });
  await questions.insertDomain({ id: `dom-${examId}-res`, examId: `exam-${examId}`, code: 'resilience', name: '복원력', weight: 40 });
  for (let i = 0; i < questionCount; i += 1) {
    const qid = `q-${examId}-${i}`;
    const domainId = i % 2 === 0 ? `dom-${examId}-sec` : `dom-${examId}-res`;
    await questions.insertQuestion({ id: qid, examId: `exam-${examId}`, domainId, now: NOW() });
    const optionIds = [`${qid}-a`, `${qid}-b`, `${qid}-c`, `${qid}-d`];
    await questions.insertVersion({
      id: `${qid}-v1`,
      questionId: qid,
      stem: `문제 ${i}`,
      explanation: `해설 ${i}`,
      sourceUrls: [],
      answerOptionIds: [optionIds[1]],
      optionSetHash: `hash-${qid}`,
      options: optionIds.map((id, k) => ({ id, optionKey: ['A', 'B', 'C', 'D'][k] as string, text: `보기 ${k}` })),
      now: NOW(),
    });
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006]);
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 테스트가 실제 강제 여부를 드러낸다.
  }
});

beforeEach(async () => {
  for (const t of [
    'study_set_items',
    'study_sets',
    'question_options',
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
  await seedBank();
});

describe('마이그레이션 0005', () => {
  it('study_sets·study_set_items 테이블과 부분 UNIQUE가 만들어진다', async () => {
    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('study_sets', 'study_set_items')")
      .all<{ name: string }>();
    expect(tables.results.map((r) => r.name).sort()).toEqual(['study_set_items', 'study_sets']);
    const indexes = await db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'study_sets'")
      .all<{ name: string; sql: string }>();
    const partial = indexes.results.find((r) => r.name === 'study_sets_user_exam_active_uq');
    expect(partial?.sql).toContain("WHERE status = 'active'");
  });
});

describe('세트 생명주기 (인증·시작·답변·제출·이력)', () => {
  it('start→answer→submit→history 전체 흐름', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000a1');
    const started = await studyRequest('/api/study/sets', {
      method: 'POST',
      token,
      body: { examId: EXAM, mode: 'all' },
    });
    expect(started.status).toBe(201);
    const set = (await started.json()) as { id: string; items: Array<{ questionId: string; answerOptionIds?: unknown; explanation?: unknown; sourceUrls?: unknown; stem?: unknown; options?: unknown }> };
    expect(set.items).toHaveLength(20);
    for (const item of set.items) {
      expect(item.answerOptionIds).toBeUndefined();
      expect(item.explanation).toBeUndefined();
      expect(item.sourceUrls).toBeUndefined();
      expect(typeof item.stem).toBe('string');
      expect((item.stem as string).length).toBeGreaterThan(0);
      expect(item.options).toHaveLength(4);
    }
    const firstId = set.items[0]?.questionId ?? '';
    const answered = await studyRequest(`/api/study/sets/${set.id}/answers`, {
      method: 'PATCH',
      token,
      body: { questionId: firstId, response: { kind: 'pass' } },
    });
    expect(answered.status).toBe(200);
    const submitted = await studyRequest(`/api/study/sets/${set.id}/submit`, {
      method: 'POST',
      token,
      body: { confirmUnanswered: true },
    });
    expect(submitted.status).toBe(200);
    const result = (await submitted.json()) as {
      items: Array<{ questionId: string; explanation: string; sourceUrls: string[] }>;
      result: { accuracyPercent: number; passCount: number; unansweredCount: number; perItem: Array<{ correctOptionIds: string[] | null }> };
    };
    expect(result.result.passCount).toBe(1);
    expect(result.result.unansweredCount).toBe(19);
    expect(result.result.perItem[0]?.correctOptionIds).toHaveLength(1);
    for (const item of result.items) {
      expect(item.explanation.length).toBeGreaterThan(0);
      expect(Array.isArray(item.sourceUrls)).toBe(true);
    }
    const history = await studyRequest('/api/study/sets?page=1&pageSize=20', { token });
    expect(history.status).toBe(200);
    const page = (await history.json()) as { items: unknown[]; total: number };
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
  });

  it('미인증은 401, 타인 세트는 404다', async () => {
    expect((await studyRequest('/api/study/sets', { method: 'POST', body: { examId: EXAM, mode: 'all' } })).status).toBe(401);
    const owner = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000b1');
    const other = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000b2');
    const started = await studyRequest('/api/study/sets', { method: 'POST', token: owner, body: { examId: EXAM, mode: 'all' } });
    const set = (await started.json()) as { id: string };
    expect((await studyRequest(`/api/study/sets/${set.id}`, { token: other })).status).toBe(404);
    expect(
      (
        await studyRequest(`/api/study/sets/${set.id}/answers`, {
          method: 'PATCH',
          token: other,
          body: { questionId: 'q-x', response: { kind: 'pass' } },
        })
      ).status,
    ).toBe(404);
  });

  it('두 번째 활성 세트는 409, 포기 후에는 다시 시작된다', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000a2');
    const first = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    expect(first.status).toBe(201);
    const second = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    expect(second.status).toBe(409);
    const set = (await first.json()) as { id: string };
    const abandoned = await studyRequest(`/api/study/sets/${set.id}/abandon`, { method: 'POST', token, body: { confirm: true } });
    expect(abandoned.status).toBe(200);
    const third = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    expect(third.status).toBe(201);
  });

  it('동시 시작 경합은 하나만 성공한다(부분 UNIQUE)', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000a3');
    const [a, b] = await Promise.all([
      studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } }),
      studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('unknown_option 422, 미확인 제출 422, 영역 누락 422, 풀 부족 422', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000a4');
    const started = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    const set = (await started.json()) as { id: string; items: Array<{ questionId: string }> };
    const bad = await studyRequest(`/api/study/sets/${set.id}/answers`, {
      method: 'PATCH',
      token,
      body: { questionId: set.items[0]?.questionId, response: { kind: 'answered', optionIds: ['no-such-option'] } },
    });
    expect(bad.status).toBe(422);
    const unconfirmed = await studyRequest(`/api/study/sets/${set.id}/submit`, { method: 'POST', token, body: { confirmUnanswered: false } });
    expect(unconfirmed.status).toBe(422);
    const noDomain = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'domain' } });
    expect(noDomain.status).toBe(422);
    await seedBank(3, SMALL_EXAM);
    const small = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: SMALL_EXAM, mode: 'all' } });
    expect(small.status).toBe(422);
  });
});

describe('스냅샷 채점 (개정 불변)', () => {
  it('시작 후 문제가 개정돼도 스냅샷 정답으로 채점한다', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000a5');
    const started = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    const set = (await started.json()) as {
      id: string;
      items: Array<{ questionId: string; questionVersionId: string; answerOptionIds?: unknown }>;
    };
    const target = set.items[0] as { questionId: string; questionVersionId: string; answerOptionIds?: unknown };
    expect(target.answerOptionIds).toBeUndefined();
    const questions = createD1QuestionBankRepository(db);
    const detail = await questions.findVersion({ questionId: target.questionId });
    const currentAnswer = detail?.answerOptionIds ?? [];
    // 개정: 정답을 다른 보기로 교체한다
    const options = await questions.findOptionsByVersion({ questionVersionId: target.questionVersionId });
    const other = options.find((o) => !currentAnswer.includes(o.id))?.id ?? options[1]?.id ?? '';
    await questions.insertVersion({
      id: `${target.questionVersionId}-v2`,
      questionId: target.questionId,
      stem: '개정된 문제',
      explanation: '개정 해설',
      sourceUrls: [],
      answerOptionIds: [other],
      optionSetHash: 'hash-v2',
      options: options.map((o) => ({ id: `${o.id}-v2`, optionKey: o.optionKey, text: o.text })),
      now: NOW(),
    });
    // 스냅샷(구 정답)으로 답하면 정답 처리된다
    await studyRequest(`/api/study/sets/${set.id}/answers`, {
      method: 'PATCH',
      token,
      body: { questionId: target.questionId, response: { kind: 'answered', optionIds: currentAnswer } },
    });
    const submitted = await studyRequest(`/api/study/sets/${set.id}/submit`, {
      method: 'POST',
      token,
      body: { confirmUnanswered: true },
    });
    expect(submitted.status).toBe(200);
    const result = (await submitted.json()) as { result: { correctCount: number; perItem: Array<{ questionId: string; correct: boolean }> } };
    expect(result.result.perItem.find((i) => i.questionId === target.questionId)?.correct).toBe(true);
  });
});

describe('멱등성 (#52)', () => {
  async function countActive(): Promise<number> {
    const rows = await db.prepare("SELECT COUNT(*) AS c FROM study_sets WHERE status = 'active'").all<{ c: number }>();
    return Number(rows.results[0]?.c ?? 0);
  }

  it('중복 세트 생성(순차): 첫 201, 둘째 409 active_set_exists, 활성 1개', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000c1');
    const first = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    expect(first.status).toBe(201);
    const second = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    expect(second.status).toBe(409);
    expect((await second.json()) as { error: string }).toMatchObject({ error: 'active_set_exists' });
    expect(await countActive()).toBe(1);
  });

  it('중복 제출(순차): 첫 200, 재제출 409 not_active, 이력 중복 없음', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000c2');
    const started = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    const set = (await started.json()) as { id: string };
    const first = await studyRequest(`/api/study/sets/${set.id}/submit`, {
      method: 'POST',
      token,
      body: { confirmUnanswered: true },
    });
    expect(first.status).toBe(200);
    const retry = await studyRequest(`/api/study/sets/${set.id}/submit`, {
      method: 'POST',
      token,
      body: { confirmUnanswered: true },
    });
    expect(retry.status).toBe(409);
    expect((await retry.json()) as { error: string }).toMatchObject({ error: 'not_active' });
    const history = await studyRequest('/api/study/sets?page=1&pageSize=20', { token });
    expect(history.status).toBe(200);
    expect(((await history.json()) as { total: number }).total).toBe(1);
  });

  it('동시 제출 경합: 200 1건·409 1건, 이력 1·결과 1회 저장', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000c5');
    const started = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    const set = (await started.json()) as { id: string };
    const [a, b] = await Promise.all([
      studyRequest(`/api/study/sets/${set.id}/submit`, { method: 'POST', token, body: { confirmUnanswered: true } }),
      studyRequest(`/api/study/sets/${set.id}/submit`, { method: 'POST', token, body: { confirmUnanswered: true } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const rejected = a.status === 409 ? a : b;
    expect((await rejected.json()) as { error: string }).toMatchObject({ error: 'not_active' });
    const history = await studyRequest('/api/study/sets?page=1&pageSize=20', { token });
    expect(history.status).toBe(200);
    expect(((await history.json()) as { total: number }).total).toBe(1);
    const got = await studyRequest(`/api/study/sets/${set.id}`, { token });
    expect(got.status).toBe(200);
    const view = (await got.json()) as { status: string; result?: { correctCount: number } };
    expect(view.status).toBe('submitted');
    expect(view.result).toBeDefined();
  });

  it('답안 PATCH 반복: 둘 다 200, GET response 동일·중복 없음', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000c3');
    const started = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    const set = (await started.json()) as { id: string; items: Array<{ questionId: string }> };
    const qid = set.items[0]?.questionId ?? '';
    const body = { questionId: qid, response: { kind: 'pass' } };
    const a = await studyRequest(`/api/study/sets/${set.id}/answers`, { method: 'PATCH', token, body });
    const b = await studyRequest(`/api/study/sets/${set.id}/answers`, { method: 'PATCH', token, body });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const got = await studyRequest(`/api/study/sets/${set.id}`, { token });
    expect(got.status).toBe(200);
    const view = (await got.json()) as { items: Array<{ questionId: string; response: { kind: string } }> };
    expect(view.items).toHaveLength(20);
    expect(view.items.filter((i) => i.questionId === qid)).toHaveLength(1);
    expect(view.items.find((i) => i.questionId === qid)?.response).toMatchObject({ kind: 'pass' });
  });

  it('동시 세트 생성: 201 1건·409 1건, 활성 1개(순서 무관)', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000c4');
    const [a, b] = await Promise.all([
      studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } }),
      studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const rejected = a.status === 409 ? a : b;
    expect((await rejected.json()) as { error: string }).toMatchObject({ error: 'active_set_exists' });
    expect(await countActive()).toBe(1);
  });
});
