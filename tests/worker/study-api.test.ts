import { env } from 'cloudflare:workers';
import { encrypt } from 'paseto-ts/v4';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizePasetoLocalKey } from '@/infra/auth/session/keyring';
import { sha256Hex } from '@/infra/auth/session/crypto';
import { createApp } from '@/infra/http/app';
import { createD1QuestionBankRepository } from '@/infra/persistence/d1-question-bank-repository';
import { createD1QuestionPool } from '@/infra/persistence/study-pool';
import migration0000 from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import migration0001 from '../../drizzle/migrations/0001_add-users-external-identities.sql?raw';
import migration0002 from '../../drizzle/migrations/0002_add-sessions.sql?raw';
import migration0003 from '../../drizzle/migrations/0003_add-question-bank.sql?raw';
import migration0004 from '../../drizzle/migrations/0004_add-admin-api.sql?raw';
import migration0005 from '../../drizzle/migrations/0005_add-study-sets.sql?raw';
import migration0006 from '../../drizzle/migrations/0006_add-study-item-content.sql?raw';
import migration0009 from '../../drizzle/migrations/0009_add-study-attempts.sql?raw';
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
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0009]);
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 테스트가 실제 강제 여부를 드러낸다.
  }
});

beforeEach(async () => {
  for (const t of [
    'study_attempts',
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
    const set = (await started.json()) as { id: string; items: Array<{ questionId: string; answerOptionIds?: unknown; answerCount?: unknown; explanation?: unknown; sourceUrls?: unknown; stem?: unknown; options?: unknown }> };
    expect(set.items).toHaveLength(4);
    for (const item of set.items) {
      expect(item.answerOptionIds).toBeUndefined();
      expect(item.answerCount).toBe(1);
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
    expect(result.result.unansweredCount).toBe(3);
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
    await seedBank(0, SMALL_EXAM);
    const small = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: SMALL_EXAM, mode: 'all' } });
    expect(small.status).toBe(422);
  });

  it('#308 단일 선택 문항에 2개 option 답변 요청은 422 invalid_selection_count로 거부된다', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000c1');
    const started = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    expect(started.status).toBe(201);
    const set = (await started.json()) as { id: string; items: Array<{ questionId: string; answerCount: number }> };
    const item = set.items[0] as { questionId: string; answerCount: number };
    expect(item.answerCount).toBe(1); // seed는 단일 선택(정답 1개)이다.
    const bad = await studyRequest(`/api/study/sets/${set.id}/answers`, {
      method: 'PATCH',
      token,
      body: { questionId: item.questionId, response: { kind: 'answered', optionIds: [`${item.questionId}-a`, `${item.questionId}-b`] } },
    });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: 'invalid_selection_count' });
    // 이력 오염 없음 — 같은 문항에 정상 1개 답변은 그대로 받는다.
    const ok = await studyRequest(`/api/study/sets/${set.id}/answers`, {
      method: 'PATCH',
      token,
      body: { questionId: item.questionId, response: { kind: 'answered', optionIds: [`${item.questionId}-b`] } },
    });
    expect(ok.status).toBe(200);
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
    expect(view.items).toHaveLength(4);
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

describe('현재 활성 세트 조회 (#148)', () => {
  it('current는 본인 활성 세트를 200으로 복원하고 정답·해설은 노출하지 않는다', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000e1');
    const started = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    expect(started.status).toBe(201);
    const created = (await started.json()) as { id: string };
    const current = await studyRequest(`/api/study/sets/current?examId=${EXAM}`, { token });
    expect(current.status).toBe(200);
    expect(current.headers.get('cache-control')).toBe('no-store');
    const body = (await current.json()) as {
      id: string;
      items: Array<{ stem?: unknown; answerOptionIds?: unknown; answerCount?: unknown; explanation?: unknown; sourceUrls?: unknown }>;
    };
    // `current`가 `:id`로 잡히면 id가 'current'인 세트가 없어 404가 된다.
    expect(body.id).toBe(created.id);
    expect(body.items).toHaveLength(4);
    for (const item of body.items) {
      expect(typeof item.stem).toBe('string');
      expect(item.answerOptionIds).toBeUndefined();
      expect(item.answerCount).toBe(1);
      expect(item.explanation).toBeUndefined();
      expect(item.sourceUrls).toBeUndefined();
    }
  });

  it('활성 세트가 없거나 제출 완료만 있으면 404 no_active_set', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000e2');
    const none = await studyRequest(`/api/study/sets/current?examId=${EXAM}`, { token });
    expect(none.status).toBe(404);
    expect(await none.json()).toMatchObject({ error: 'no_active_set' });
    const started = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    const set = (await started.json()) as { id: string };
    await studyRequest(`/api/study/sets/${set.id}/submit`, { method: 'POST', token, body: { confirmUnanswered: true } });
    const done = await studyRequest(`/api/study/sets/current?examId=${EXAM}`, { token });
    expect(done.status).toBe(404);
    expect(await done.json()).toMatchObject({ error: 'no_active_set' });
  });

  it('다른 사용자의 활성 세트는 404, 미인증 401, examId 누락·빈 값 422', async () => {
    const owner = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000e3');
    const other = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000e4');
    expect((await studyRequest('/api/study/sets', { method: 'POST', token: owner, body: { examId: EXAM, mode: 'all' } })).status).toBe(201);
    const theirs = await studyRequest(`/api/study/sets/current?examId=${EXAM}`, { token: other });
    expect(theirs.status).toBe(404);
    expect(await theirs.json()).toMatchObject({ error: 'no_active_set' });
    expect((await studyRequest(`/api/study/sets/current?examId=${EXAM}`)).status).toBe(401);
    expect((await studyRequest('/api/study/sets/current', { token: owner })).status).toBe(422);
    const empty = await studyRequest('/api/study/sets/current?examId=', { token: owner });
    expect(empty.status).toBe(422);
    expect(await empty.json()).toMatchObject({ error: 'validation_failed' });
  });
});

describe('제출→attempt 저장 (#54)', () => {
  it('제출 후 study_attempts 10행·source·firstAttempt·stats 반영', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000d1');
    const started = await studyRequest('/api/study/sets', { method: 'POST', token, body: { examId: EXAM, mode: 'all' } });
    expect(started.status).toBe(201);
    const set = (await started.json()) as {
      id: string;
      items: Array<{ questionId: string; optionOrder: string[] }>;
    };
    expect(set.items).toHaveLength(4);
    const first = set.items[0] as { questionId: string; optionOrder: string[] };
    const second = set.items[1] as { questionId: string };
    await studyRequest(`/api/study/sets/${set.id}/answers`, {
      method: 'PATCH',
      token,
      body: { questionId: first.questionId, response: { kind: 'answered', optionIds: [first.optionOrder[0]] } },
    });
    await studyRequest(`/api/study/sets/${set.id}/answers`, {
      method: 'PATCH',
      token,
      body: { questionId: second.questionId, response: { kind: 'pass' } },
    });
    const submitted = await studyRequest(`/api/study/sets/${set.id}/submit`, {
      method: 'POST',
      token,
      body: { confirmUnanswered: true },
    });
    expect(submitted.status).toBe(200);
    const rows = await db
      .prepare(
        'SELECT question_id AS questionId, source, source_id AS sourceId, outcome, occurred_at AS occurredAt, first_attempt AS firstAttempt FROM study_attempts WHERE source_id = ?1',
      )
      .bind(set.id)
      .all<{ questionId: string; source: string; sourceId: string; outcome: string; occurredAt: number; firstAttempt: number }>();
    expect(rows.results).toHaveLength(4);
    for (const r of rows.results) {
      expect(r.source).toBe('set');
      expect(r.sourceId).toBe(set.id);
      expect(r.occurredAt).toBeGreaterThan(1_000_000_000_000);
    }
    const byQ = new Map(rows.results.map((r) => [r.questionId, r]));
    expect(byQ.get(first.questionId)?.firstAttempt).toBe(1);
    expect(byQ.get(second.questionId)?.firstAttempt).toBe(0);
    const stats = await studyRequest(`/api/study/stats?examId=${EXAM}`, { token });
    expect(stats.status).toBe(200);
    const body = (await stats.json()) as { uniqueFirstSolved: number; overallAccuracy: number | null };
    expect(body.uniqueFirstSolved).toBe(1);
    expect(body.overallAccuracy).not.toBeNull();
  });
});

describe('세트 크기 size 계약 (4/8·기본 4·잘못된 값 422, #275)', () => {
  it('size 8 → 8문항, size 생략 → 기본 4문항', async () => {
    const eight = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000c1');
    const r8 = await studyRequest('/api/study/sets', {
      method: 'POST',
      token: eight,
      body: { examId: EXAM, mode: 'all', size: 8 },
    });
    expect(r8.status).toBe(201);
    const set8 = (await r8.json()) as { items: unknown[] };
    expect(set8.items).toHaveLength(8);

    const def = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000c2');
    const r4 = await studyRequest('/api/study/sets', {
      method: 'POST',
      token: def,
      body: { examId: EXAM, mode: 'all' },
    });
    expect(r4.status).toBe(201);
    const set4 = (await r4.json()) as { items: unknown[] };
    expect(set4.items).toHaveLength(4);
  });

  it('size 3·9·"4"·null → 422', async () => {
    const token = await mintSession('0f9f1a3e-6f1a-4c2e-8f0b-0000000000c3');
    for (const size of [3, 9, '4', null]) {
      const res = await studyRequest('/api/study/sets', {
        method: 'POST',
        token,
        body: { examId: EXAM, mode: 'all', size },
      });
      expect(res.status).toBe(422);
    }
  });
});

describe('legacy 10문항 세트 D1 호환 (#268 Slice 2C)', () => {
  const LEGACY_USER = '0f9f1a3e-6f1a-4c2e-8f0b-00000000a101';
  const LEGACY_SET = 'legacy-set-10-w1';
  const LEGACY_COUNT = 10;

  /** 구(10문항) 규격 세트를 생성 경로를 거치지 않고 D1 에 직접 적재한다(단위 legacy 테스트와 같은 방식). */
  async function seedLegacyTenSet(userId: string): Promise<void> {
    const now = NOW();
    await db
      .prepare(
        "INSERT INTO study_sets (id, user_id, exam_id, mode, domain_id, status, created_at) VALUES (?1, ?2, ?3, 'all', NULL, 'active', ?4)",
      )
      .bind(LEGACY_SET, userId, EXAM, now)
      .run();
    for (let i = 0; i < LEGACY_COUNT; i += 1) {
      const qid = `q-${EXAM}-${i}`;
      const vid = `${qid}-v1`;
      const optionIds = [`${qid}-a`, `${qid}-b`, `${qid}-c`, `${qid}-d`];
      await db
        .prepare(
          "INSERT INTO study_set_items (set_id, question_id, question_version_id, version_no, option_order, answer_option_ids, response_kind, selected_option_ids, stem, options_json, explanation, source_urls) VALUES (?1, ?2, ?3, 1, ?4, ?5, 'unanswered', '[]', ?6, ?7, ?8, ?9)",
        )
        .bind(
          LEGACY_SET,
          qid,
          vid,
          JSON.stringify(optionIds),
          JSON.stringify([optionIds[1]]),
          `구 규격 문제 ${i} 본문`,
          JSON.stringify(optionIds.map((id, k) => ({ optionId: id, text: `보기 ${k}` }))),
          `구 규격 문제 ${i} 해설`,
          JSON.stringify([`https://docs.aws.amazon.com/legacy-q-${i}`]),
        )
        .run();
    }
  }

  it('10문항 세트는 current 로 읽고 답안·제출까지 호환된다(크기 검사는 생성 시에만)', async () => {
    const token = await mintSession(LEGACY_USER);
    await seedLegacyTenSet(LEGACY_USER);

    const current = await studyRequest(`/api/study/sets/current?examId=${EXAM}`, { token });
    expect(current.status).toBe(200);
    const restored = (await current.json()) as {
      id: string;
      items: Array<{ questionId: string; answerCount: number; answerOptionIds?: unknown; stem?: unknown }>;
    };
    expect(restored.id).toBe(LEGACY_SET);
    expect(restored.items).toHaveLength(LEGACY_COUNT);
    for (const item of restored.items) {
      expect(item.answerCount).toBe(1);
      // 정답·해설은 제출 전 노출되지 않는다.
      expect(item.answerOptionIds).toBeUndefined();
      expect(typeof item.stem).toBe('string');
    }

    // 10문항 모두 답한다(스냅샷 정답 = 보기 B).
    for (const item of restored.items) {
      const answer = await studyRequest(`/api/study/sets/${LEGACY_SET}/answers`, {
        method: 'PATCH',
        token,
        body: {
          questionId: item.questionId,
          response: { kind: 'answered', optionIds: [`${item.questionId}-b`] },
        },
      });
      expect(answer.status).toBe(200);
    }

    const submitted = await studyRequest(`/api/study/sets/${LEGACY_SET}/submit`, {
      method: 'POST',
      token,
      body: { confirmUnanswered: true },
    });
    expect(submitted.status).toBe(200);
    const result = (await submitted.json()) as {
      items: Array<{ questionId: string; explanation: string; sourceUrls: string[] }>;
      result: { answeredCount: number; unansweredCount: number; accuracyPercent: number; perItem: Array<{ correctOptionIds: string[] | null }> };
    };
    expect(result.result.answeredCount).toBe(LEGACY_COUNT);
    expect(result.result.unansweredCount).toBe(0);
    expect(result.result.accuracyPercent).toBe(100);
    expect(result.result.perItem).toHaveLength(LEGACY_COUNT);
    for (const item of result.items) {
      expect(item.explanation.length).toBeGreaterThan(0);
      expect(Array.isArray(item.sourceUrls)).toBe(true);
    }
  });
});


describe('기풀이 문제 풀 집계 (#311)', () => {
  async function seedAttempt(input: {
    readonly userId: string;
    readonly examId: string;
    readonly questionId: string;
    readonly outcome: string;
    readonly status: 'active' | 'abandoned' | 'submitted';
    readonly source?: 'set' | 'review';
    readonly excludedAt?: number | null;
  }): Promise<void> {
    const setId = crypto.randomUUID();
    const now = NOW();
    await db
      .prepare('INSERT INTO study_sets (id, user_id, exam_id, mode, domain_id, status, created_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6)')
      .bind(setId, input.userId, input.examId, 'all', input.status, now)
      .run();
    await db
      .prepare(
        'INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)',
      )
      .bind(
        crypto.randomUUID(),
        input.userId,
        input.examId,
        input.questionId,
        input.questionId + '-v1',
        input.outcome,
        now * 1000,
        input.source ?? 'set',
        setId,
        input.excludedAt ?? null,
      )
      .run();
  }

  it('제출된 세트의 정답·오답만 기풀이로 표시하고 계정·시험·상태를 격리한다', async () => {
    // Given: 네 문항을 정답·오답·Pass·미응답으로 제출한 사용자와 다른 계정의 제출 이력이 있다.
    const userId = '0f9f1a3e-6f1a-4c2e-8f0b-000000000311';
    const otherUserId = '0f9f1a3e-6f1a-4c2e-8f0b-000000000312';
    const token = await mintSession(userId);
    await mintSession(otherUserId);
    const started = await studyRequest('/api/study/sets', {
      method: 'POST',
      token,
      body: { examId: EXAM, mode: 'all', size: 4 },
    });
    expect(started.status).toBe(201);
    const set = (await started.json()) as { id: string; items: Array<{ questionId: string }> };
    const [correct, wrong, pass, unanswered] = set.items;
    expect(correct).toBeDefined();
    expect(wrong).toBeDefined();
    expect(pass).toBeDefined();
    expect(unanswered).toBeDefined();

    await studyRequest('/api/study/sets/' + set.id + '/answers', {
      method: 'PATCH',
      token,
      body: { questionId: correct!.questionId, response: { kind: 'answered', optionIds: [correct!.questionId + '-b'] } },
    });
    await studyRequest('/api/study/sets/' + set.id + '/answers', {
      method: 'PATCH',
      token,
      body: { questionId: wrong!.questionId, response: { kind: 'answered', optionIds: [wrong!.questionId + '-a'] } },
    });
    await studyRequest('/api/study/sets/' + set.id + '/answers', {
      method: 'PATCH',
      token,
      body: { questionId: pass!.questionId, response: { kind: 'pass' } },
    });
    const submitted = await studyRequest('/api/study/sets/' + set.id + '/submit', {
      method: 'POST',
      token,
      body: { confirmUnanswered: true },
    });
    expect(submitted.status).toBe(200);

    const candidates = Array.from({ length: 24 }, (_, index) => 'q-' + EXAM + '-' + index);
    const submittedIds = new Set(set.items.map((item) => item.questionId));
    const isolatedQuestionId = candidates.find((questionId) => !submittedIds.has(questionId));
    expect(isolatedQuestionId).toBeDefined();

    // 다음 세트는 제출 완료된 정답·오답을 제외하고 아직 미풀이인 문제부터 뽑는다.
    const nextStarted = await studyRequest('/api/study/sets', {
      method: 'POST',
      token,
      body: { examId: EXAM, mode: 'all', size: 4 },
    });
    expect(nextStarted.status).toBe(201);
    const nextSet = (await nextStarted.json()) as { id: string; items: Array<{ questionId: string }> };
    expect(nextSet.items.every((item) => item.questionId !== correct!.questionId && item.questionId !== wrong!.questionId)).toBe(true);
    const abandonedNext = await studyRequest('/api/study/sets/' + nextSet.id + '/abandon', {
      method: 'POST',
      token,
      body: { confirm: true },
    });
    expect(abandonedNext.status).toBe(200);

    // 타 계정 제출, 다른 시험, 진행 중/포기, Pass, review 출처, 정정 제외 시도는 기풀이가 아니다.
    await seedAttempt({ userId: otherUserId, examId: EXAM, questionId: isolatedQuestionId as string, outcome: 'wrong', status: 'submitted' });
    await seedAttempt({ userId, examId: 'other-exam', questionId: isolatedQuestionId as string, outcome: 'wrong', status: 'submitted' });
    await seedAttempt({ userId, examId: EXAM, questionId: isolatedQuestionId as string, outcome: 'correct', status: 'active' });
    await seedAttempt({ userId, examId: EXAM, questionId: isolatedQuestionId as string, outcome: 'wrong', status: 'abandoned' });
    await seedAttempt({ userId, examId: EXAM, questionId: isolatedQuestionId as string, outcome: 'pass', status: 'submitted' });
    await seedAttempt({ userId, examId: EXAM, questionId: isolatedQuestionId as string, outcome: 'wrong', status: 'submitted', source: 'review' });
    await seedAttempt({ userId, examId: EXAM, questionId: isolatedQuestionId as string, outcome: 'wrong', status: 'submitted', excludedAt: NOW() });

    // 제출 후 문제 버전을 바꿔도 기록의 questionId가 같으므로 기풀이 상태가 이어진다.
    const bank = createD1QuestionBankRepository(db);
    const correctQuestionId = correct!.questionId;
    await bank.insertVersion({
      id: correctQuestionId + '-v2',
      questionId: correctQuestionId,
      stem: '개정된 문제',
      explanation: '개정 해설',
      sourceUrls: [],
      answerOptionIds: [correctQuestionId + '-v2-b'],
      optionSetHash: correctQuestionId + '-hash-v2',
      options: ['a', 'b', 'c', 'd'].map((key) => ({
        id: correctQuestionId + '-v2-' + key,
        optionKey: key.toUpperCase(),
        text: '개정 보기 ' + key,
      })),
      now: NOW(),
    });

    // When: 대상 계정과 다른 계정의 시험 풀을 각각 조회한다.
    const userPool = await createD1QuestionPool(db, EXAM).listPool({ userId });
    const otherUserPool = await createD1QuestionPool(db, EXAM).listPool({ userId: otherUserId });
    const byQuestionId = new Map(userPool.map((entry) => [entry.questionId, entry]));
    const otherByQuestionId = new Map(otherUserPool.map((entry) => [entry.questionId, entry]));

    // Then: 제출된 정답·오답만 attempted이고, 정정 제외 기록은 무시하며 버전 변경 뒤에도 격리된다.
    expect(byQuestionId.get(correctQuestionId)?.attempted).toBe(true);
    expect(byQuestionId.get(correctQuestionId)?.version.versionNo).toBe(2);
    expect(byQuestionId.get(wrong!.questionId)?.attempted).toBe(true);
    expect(byQuestionId.get(pass!.questionId)?.attempted).toBe(false);
    expect(byQuestionId.get(unanswered!.questionId)?.attempted).toBe(false);
    expect(byQuestionId.get(isolatedQuestionId as string)?.attempted).toBe(false);
    expect(otherByQuestionId.get(isolatedQuestionId as string)?.attempted).toBe(true);
  });
});
