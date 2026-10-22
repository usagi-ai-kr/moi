import { env } from 'cloudflare:workers';
import { encrypt } from 'paseto-ts/v4';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizePasetoLocalKey } from '@/infra/auth/session/keyring';
import { sha256Hex } from '@/infra/auth/session/crypto';
import { createApp } from '@/infra/http/app';
import { answerReviewItem, endReviewSession } from '@/app/review';
import type { ReviewDeps } from '@/app/review/ports';
import type { ReviewSession } from '@/domain/review/types';
import { createReviewRuntime } from '@/infra/http/review/runtime';
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
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FAKE_REDIRECT_URI, applyD1Migrations } from './fixtures/kakao-fakes';

// #51/#130/#54 복습 HTTP 실제 경로 — 인증·후보·시작·채점·재개·북마크·종료·경합을 Hono+D1로 증명한다.
const db = env.DB;

function randomBase64Key(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const KEY = randomBase64Key();
function envWithKeys(keys: { v1: string }) {
  return {
    ...env,
    PASETO_KEY_V1: keys.v1,
    KAKAO_CLIENT_ID: FAKE_CLIENT_ID,
    KAKAO_CLIENT_SECRET: FAKE_CLIENT_SECRET,
    KAKAO_REDIRECT_URI: FAKE_REDIRECT_URI,
  };
}
const testEnv = envWithKeys({ v1: KEY });
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

function req(path: string, init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}, target = app) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.token !== undefined) headers['cookie'] = `__Host-moi_session=${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return target.fetch(
    new Request(`https://moi.test${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    testEnv,
  );
}

const EXAM_CODE = 'saa-c03';
const U1 = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000e1';
const U2 = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000e2';

function createRaceApp(interleave: (deps: ReviewDeps, stale: ReviewSession) => Promise<void>) {
  let intercepted = false;
  return createApp({
    createReviewRuntime: (runtimeEnv, requestId) => {
      const runtime = createReviewRuntime(runtimeEnv, requestId);
      return {
        ...runtime,
        createDeps({ db: targetDb }) {
          const deps = runtime.createDeps({ db: targetDb });
          const findActive = deps.repository.findActive.bind(deps.repository);
          return {
            ...deps,
            repository: {
              ...deps.repository,
              async findActive(input) {
                const active = await findActive(input);
                if (!intercepted && active !== null) {
                  intercepted = true;
                  await interleave(deps, active);
                }
                return active;
              },
            },
          };
        },
      };
    },
  });
}

async function seed20(): Promise<void> {
  const now = NOW();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(U1, now, now).run();
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(U2, now, now).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(now).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-2', 'sap-c02', 'SAP', ?1)").bind(now).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-2', 'e-2', 'sec', 'sec', 100)").run();
  for (let i = 0; i < 20; i += 1) {
    const q = `q-${i}`;
    await db.prepare("INSERT INTO questions (id, exam_id, domain_id, status, current_version_no, created_at, updated_at) VALUES (?1, 'e-1', 'd-1', 'active', 1, ?2, ?2)").bind(q, now).run();
    const vid = `${q}-v1`;
    await db.prepare("INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, ?3, ?4, '[]', ?5, 'h', 'pending', ?6)")
      .bind(vid, q, `stem-${q}`, `expl-${q}`, JSON.stringify([`${vid}-o2`]), now).run();
    for (const o of ['o1', 'o2']) {
      await db.prepare('INSERT INTO question_options (id, question_version_id, option_key, text) VALUES (?1, ?2, ?3, ?4)').bind(`${vid}-${o}`, vid, o, `${o}-text-${q}`).run();
    }
    const outcome = i % 3 === 0 ? 'wrong' : i % 3 === 1 ? 'pass' : 'unanswered';
    await db.prepare("INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, '0f9f1a3e-6f1a-4c2e-8f0b-0000000000e1', 'e-1', ?2, ?3, ?4, ?5, 'set', ?6, NULL, 0)")
      .bind(`a-${i}`, q, vid, outcome, now * 1000 + i, `set-a-${i}`).run();
  }
  await db.prepare("INSERT INTO questions (id, exam_id, domain_id, status, current_version_no, created_at, updated_at) VALUES ('q-other', 'e-2', 'd-2', 'active', 1, ?1, ?1)").bind(now).run();
  await db.prepare("INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES ('q-other-v1', 'q-other', 1, 'stem-other', 'expl-other', '[]', '[\"q-other-v1-o2\"]', 'h', 'pending', ?1)").bind(now).run();
  for (const o of ['o1', 'o2']) {
    await db.prepare('INSERT INTO question_options (id, question_version_id, option_key, text) VALUES (?1, ?2, ?3, ?4)').bind(`q-other-v1-${o}`, 'q-other-v1', o, `${o}-other`).run();
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008, migration0009, migration0010, migration0011, migration0012, migration0013]);
  try { await db.exec('PRAGMA foreign_keys = ON;'); } catch { /* pragma 미지원 시 FK 자체 검증 */ }
});

beforeEach(async () => {
  for (const t of ['study_attempts', 'study_set_items', 'study_sets', 'review_bookmarks', 'review_sessions', 'question_options', 'question_versions', 'questions']) await db.prepare(`DELETE FROM ${t}`).run();
  for (const t of ['sessions', 'users', 'exam_domains', 'exams']) await db.prepare(`DELETE FROM ${t}`).run();
  await seed20();
});

describe('복습 HTTP 인증·검증', () => {
  it('인증없음 401, mode부정 422', async () => {
    expect((await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=wrong`)).status).toBe(401);
    const token = await mintSession(U1);
    expect((await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=bad`, { token })).status).toBe(422);
    expect((await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } })).status).toBe(201);
  });

  it('size 는 4·8 만 허용한다 — 9 는 Zod 가 먼저 막아 422 validation_failed (#268)', async () => {
    const token = await mintSession(U1);
    const res = await req('/api/review/sessions', {
      method: 'POST',
      token,
      body: { examId: EXAM_CODE, mode: 'wrong', size: 9 },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'validation_failed' });
    // 도메인의 invalid_size 는 HTTP 경로에서는 Zod 뒤에 닿지 않는다(경계가 먼저 막는다).
    expect((await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong', size: 8 } })).status).toBe(201);
  });

  it('교차 출처 쓰기를 차단하고 GET·쓰기 응답에 no-store를 붙인다', async () => {
    const token = await mintSession(U1);
    const blocked = await req('/api/review/sessions', {
      method: 'POST',
      token,
      body: { examId: EXAM_CODE, mode: 'wrong' },
      headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get('cache-control')).toBe('no-store');
    const candidates = await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=wrong`, { token });
    expect(candidates.headers.get('cache-control')).toBe('no-store');
    const sessions = await db.prepare('SELECT COUNT(*) AS c FROM review_sessions').first<{ c: number }>();
    expect(sessions?.c).toBe(0);
  });

  it('가짜계정·시험격리 — u-2/e-2는 각자 목록만 본다', async () => {
    const u1 = await mintSession(U1);
    const u2 = await mintSession(U2);
    const mine = (await (await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=wrong`, { token: u1 })).json()) as { total: number };
    expect(mine.total).toBe(20);
    const other = (await (await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=wrong`, { token: u2 })).json()) as { total: number };
    expect(other.total).toBe(0);
    const exam2 = (await (await req('/api/review/candidates?examId=sap-c02&mode=wrong', { token: u1 })).json()) as { total: number };
    expect(exam2.total).toBe(0);
  });
});

describe('복습 HTTP 후보→시작→채점→재개', () => {
  it('실제 10문제 세트 HTTP 제출에서 복습 후보·채점·재개까지 D1에 보존한다', async () => {
    // seed20은 exam id=e-1 / code=saa-c03 fixture다. 세트 생성은 ID, 복습 조회는 code를 쓰고 setup attempt는 제거한다.
    await db.prepare('DELETE FROM study_attempts').run();
    const before = await db.prepare('SELECT COUNT(*) AS c FROM study_attempts').first<{ c: number }>();
    expect(before?.c).toBe(0);

    const token = await mintSession(U1);
    const setStart = await req('/api/study/sets', {
      method: 'POST', token, body: { examId: 'e-1', mode: 'all' },
    });
    expect(setStart.status).toBe(201);
    const set = (await setStart.json()) as {
      id: string;
      examId: string;
      items: Array<{ questionId: string; questionVersionId: string; stem?: unknown; options: Array<{ optionId: string }>; answerOptionIds?: unknown; explanation?: unknown; sourceUrls?: unknown }>;
    };
    expect(set.examId).toBe('e-1');
    expect(set.items).toHaveLength(4);
    for (const item of set.items) {
      expect(item.answerOptionIds).toBeUndefined();
      expect(item.explanation).toBeUndefined();
      expect(item.sourceUrls).toBeUndefined();
    }

    for (const [index, item] of set.items.entries()) {
      const response = index % 4 === 0
        ? { kind: 'answered', optionIds: [`${item.questionVersionId}-o2`] }
        : index % 4 === 1
          ? { kind: 'answered', optionIds: [`${item.questionVersionId}-o1`] }
          : index % 4 === 2
            ? { kind: 'pass' }
            : { kind: 'unanswered' };
      const saved = await req(`/api/study/sets/${set.id}/answers`, {
        method: 'PATCH', token, body: { questionId: item.questionId, response },
      });
      expect(saved.status).toBe(200);
    }
    const submit = await req(`/api/study/sets/${set.id}/submit`, {
      method: 'POST', token, body: { confirmUnanswered: true },
    });
    expect(submit.status).toBe(200);
    const submitted = (await submit.json()) as { status: string; result: { correctCount: number; passCount: number; unansweredCount: number } };
    expect(submitted.status).toBe('submitted');
    expect(submitted.result).toMatchObject({ correctCount: 1, passCount: 1, unansweredCount: 1 });

    const setAttempts = await db.prepare("SELECT outcome, source, source_id, user_id, exam_id, first_attempt FROM study_attempts WHERE source = 'set'").all<{
      outcome: string; source: string; source_id: string; user_id: string; exam_id: string; first_attempt: number;
    }>();
    expect(setAttempts.results).toHaveLength(4);
    expect(setAttempts.results.every((row) => row.source_id === set.id && row.user_id === U1 && row.exam_id === 'e-1')).toBe(true);
    expect(setAttempts.results.filter((row) => row.first_attempt === 1)).toHaveLength(2);
    expect(Object.fromEntries(['correct', 'wrong', 'pass', 'unanswered'].map((outcome) => [
      outcome, setAttempts.results.filter((row) => row.outcome === outcome).length,
    ]))).toEqual({ correct: 1, wrong: 1, pass: 1, unanswered: 1 });

    const candidatesRes = await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=wrong`, { token });
    expect(candidatesRes.status).toBe(200);
    const candidates = (await candidatesRes.json()) as { total: number; items: Array<{ questionId: string; validWrongCount: number; answerOptionIds?: unknown; explanation?: unknown; sourceUrls?: unknown }> };
    expect(candidates.total).toBe(3);
    expect(candidates.items).toHaveLength(3);
    expect(candidates.items.every((item) => item.validWrongCount === 1)).toBe(true);
    for (const item of candidates.items) {
      expect(item.answerOptionIds).toBeUndefined();
      expect(item.explanation).toBeUndefined();
      expect(item.sourceUrls).toBeUndefined();
    }
    const otherToken = await mintSession(U2);
    const isolated = (await (await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=wrong`, { token: otherToken })).json()) as { total: number };
    expect(isolated.total).toBe(0);

    const startReview = await req('/api/review/sessions', {
      method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' },
    });
    expect(startReview.status).toBe(201);
    const review = (await startReview.json()) as {
      cursor: number;
      total: number;
      current: { questionId: string; response: null; answerOptionIds?: unknown; explanation?: unknown; correctOptionIds?: unknown };
    };
    expect(review.cursor).toBe(0);
    expect(review.total).toBe(3);
    expect(review.current.response).toBeNull();
    expect(review.current.answerOptionIds).toBeUndefined();
    expect(review.current.explanation).toBeUndefined();
    expect(review.current.correctOptionIds).toBeUndefined();

    const answered = await req('/api/review/sessions/current/answers', {
      method: 'POST', token,
      body: { examId: EXAM_CODE, mode: 'wrong', questionId: review.current.questionId, response: { kind: 'pass' } },
    });
    expect(answered.status).toBe(200);
    const reviewAttempt = await db.prepare("SELECT outcome, source, first_attempt FROM study_attempts WHERE source = 'review'").first<{
      outcome: string; source: string; first_attempt: number;
    }>();
    expect(reviewAttempt).toMatchObject({ outcome: 'pass', source: 'review', first_attempt: 0 });
    const savedSession = await db.prepare("SELECT cursor FROM review_sessions WHERE user_id = ?1 AND mode = 'wrong' AND status = 'active'").bind(U1).first<{ cursor: number }>();
    expect(savedSession?.cursor).toBe(1);

    const resumedRes = await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token });
    expect(resumedRes.status).toBe(200);
    const resumed = (await resumedRes.json()) as {
      cursor: number;
      items: Array<{ response: unknown; correct?: boolean }>;
      current: { answerOptionIds?: unknown; explanation?: unknown; correctOptionIds?: unknown } | null;
    };
    expect(resumed.cursor).toBe(1);
    expect(resumed.items[0]?.response).toEqual({ kind: 'pass' });
    expect(resumed.current?.answerOptionIds).toBeUndefined();
    expect(resumed.current?.explanation).toBeUndefined();
    expect(resumed.current?.correctOptionIds).toBeUndefined();
  });
  it('시험 code/id 입력은 같은 D1 복습 회차와 attempt 축을 사용한다', async () => {
    await db.prepare('DELETE FROM study_attempts').run();
    const token = await mintSession(U1);
    // 학습 세트·복습 모두 공개 code 축을 쓴다(#51 버그픽스, ADR-0058).
    const setStart = await req('/api/study/sets', {
      method: 'POST',
      token,
      body: { examId: EXAM_CODE, mode: 'all' },
    });
    expect(setStart.status).toBe(201);
    const set = (await setStart.json()) as {
      id: string;
      items: Array<{ questionId: string; questionVersionId: string }>;
    };
    const wrongQuestionId = set.items[0]?.questionId;
    const passQuestionId = set.items[1]?.questionId;
    const unansweredQuestionId = set.items[2]?.questionId;
    expect(wrongQuestionId).toBeDefined();
    expect(passQuestionId).toBeDefined();
    expect(unansweredQuestionId).toBeDefined();

    const wrongSaved = await req('/api/study/sets/' + set.id + '/answers', {
      method: 'PATCH',
      token,
      body: { questionId: wrongQuestionId, response: { kind: 'answered', optionIds: [wrongQuestionId + '-v1-o1'] } },
    });
    const passSaved = await req('/api/study/sets/' + set.id + '/answers', {
      method: 'PATCH',
      token,
      body: { questionId: passQuestionId, response: { kind: 'pass' } },
    });
    expect(wrongSaved.status).toBe(200);
    expect(passSaved.status).toBe(200);
    const submitted = await req('/api/study/sets/' + set.id + '/submit', {
      method: 'POST',
      token,
      body: { confirmUnanswered: true },
    });
    expect(submitted.status).toBe(200);

    const setRows = await db
      .prepare("SELECT question_id, outcome, exam_id FROM study_attempts WHERE source = 'set'")
      .all<{ question_id: string; outcome: string; exam_id: string }>();
    const setByQuestion = new Map(setRows.results.map((row) => [row.question_id, row]));
    expect(setByQuestion.get(wrongQuestionId)).toMatchObject({ outcome: 'wrong', exam_id: EXAM_CODE });
    expect(setByQuestion.get(passQuestionId)).toMatchObject({ outcome: 'pass', exam_id: EXAM_CODE });
    expect(setByQuestion.get(unansweredQuestionId)).toMatchObject({ outcome: 'unanswered', exam_id: EXAM_CODE });

    const start = await req('/api/review/sessions', {
      method: 'POST',
      token,
      body: { examId: EXAM_CODE, mode: 'wrong' },
    });
    expect(start.status).toBe(201);
    const review = (await start.json()) as {
      examId: string;
      cursor: number;
      current: { questionId: string };
      items: Array<{ questionId: string }>;
    };
    expect(review.examId).toBe(EXAM_CODE);
    const storedSession = await db
      .prepare("SELECT exam_id, cursor FROM review_sessions WHERE user_id = ?1 AND status = 'active'")
      .bind(U1)
      .first<{ exam_id: string; cursor: number }>();
    expect(storedSession).toEqual({ exam_id: EXAM_CODE, cursor: 0 });

    const duplicateById = await req('/api/review/sessions', {
      method: 'POST',
      token,
      body: { examId: 'e-1', mode: 'wrong' },
    });
    expect(duplicateById.status).toBe(409);
    const currentById = await req('/api/review/sessions/current?examId=e-1&mode=wrong', { token });
    expect(currentById.status).toBe(200);
    const currentIdBody = (await currentById.json()) as { cursor: number; current: { questionId: string } };
    expect(currentIdBody).toMatchObject({ cursor: 0, current: { questionId: review.current.questionId } });

    const positions = new Map(review.items.map((item, index) => [item.questionId, index]));
    const targetIds = [wrongQuestionId, passQuestionId, unansweredQuestionId];
    const targetPositions = targetIds.map((id) => positions.get(id));
    expect(targetPositions.every((index) => index !== undefined)).toBe(true);
    const lastTarget = Math.max(...targetPositions.map((index) => index ?? -1));
    for (let index = 0; index <= lastTarget; index += 1) {
      const questionId = review.items[index]?.questionId;
      if (!questionId) throw new Error('review item fixture missing');
      const response = questionId === wrongQuestionId
        ? { kind: 'answered', optionIds: [questionId + '-v1-o2'] }
        : questionId === unansweredQuestionId
          ? { kind: 'answered', optionIds: [questionId + '-v1-o1'] }
          : { kind: 'pass' };
      const answer = await req('/api/review/sessions/current/answers', {
        method: 'POST',
        token,
        body: { examId: 'e-1', mode: 'wrong', questionId, response },
      });
      expect(answer.status).toBe(200);
      if (index === 0) {
        const currentByCode = await req('/api/review/sessions/current?examId=' + EXAM_CODE + '&mode=wrong', { token });
        expect(currentByCode.status).toBe(200);
        expect((await currentByCode.json()) as { cursor: number }).toMatchObject({ cursor: 1 });
      }
    }

    const reviewRows = await db
      .prepare("SELECT question_id, outcome, exam_id, first_attempt FROM study_attempts WHERE source = 'review'")
      .all<{ question_id: string; outcome: string; exam_id: string; first_attempt: number }>();
    const reviewByQuestion = new Map(reviewRows.results.map((row) => [row.question_id, row]));
    expect(reviewByQuestion.get(wrongQuestionId)).toMatchObject({ outcome: 'correct', exam_id: EXAM_CODE, first_attempt: 0 });
    expect(reviewByQuestion.get(passQuestionId)).toMatchObject({ outcome: 'pass', exam_id: EXAM_CODE, first_attempt: 0 });
    expect(reviewByQuestion.get(unansweredQuestionId)).toMatchObject({ outcome: 'wrong', exam_id: EXAM_CODE, first_attempt: 1 });

    const refreshed = await req('/api/review/candidates?examId=' + EXAM_CODE + '&mode=wrong', { token });
    expect(refreshed.status).toBe(200);
    const refreshedBody = (await refreshed.json()) as { items: Array<{ questionId: string; validWrongCount: number }> };
    const countByQuestion = new Map(refreshedBody.items.map((item) => [item.questionId, item.validWrongCount]));
    expect(countByQuestion.get(wrongQuestionId)).toBe(1);
    expect(countByQuestion.get(passQuestionId)).toBe(2);
    expect(countByQuestion.get(unansweredQuestionId)).toBe(2);

    const ended = await req('/api/review/sessions/current/end', {
      method: 'POST',
      token,
      body: { examId: 'e-1', mode: 'wrong' },
    });
    expect(ended.status).toBe(200);
    const afterEndByCode = await req('/api/review/sessions/current?examId=' + EXAM_CODE + '&mode=wrong', { token });
    expect(afterEndByCode.status).toBe(404);

    const unknown = await req('/api/review/candidates?examId=missing-exam&mode=wrong', { token });
    expect(unknown.status).toBe(404);
    expect((await req('/api/review/sessions', {
      method: 'POST', token, body: { examId: 'missing-exam', mode: 'wrong' },
    })).status).toBe(404);
    expect((await req('/api/review/sessions/current?examId=missing-exam&mode=wrong', { token })).status).toBe(404);
    expect((await req('/api/review/sessions/current/end', {
      method: 'POST', token, body: { examId: 'missing-exam', mode: 'wrong' },
    })).status).toBe(404);
    expect((await req('/api/review/bookmarks?examId=missing-exam', { token })).status).toBe(404);
    expect((await req('/api/review/bookmarks', {
      method: 'PATCH', token, body: { examId: 'missing-exam', questionId: 'q-0', bookmarked: true },
    })).status).toBe(404);
  });

  it('20문제 후보→start→answer→cursor+attempt→GET resume, 미채점DTO 정답비노출', async () => {
    const token = await mintSession(U1);
    const candRes = await req(`/api/review/candidates?examId=${EXAM_CODE}&mode=wrong`, { token });
    expect(candRes.status).toBe(200);
    const cand = (await candRes.json()) as { total: number; items: Array<{ questionId: string; stem: string; answerOptionIds?: unknown; explanation?: unknown }> };
    expect(cand.total).toBe(20);
    for (const item of cand.items) {
      expect(typeof item.stem).toBe('string');
      expect(item.answerOptionIds).toBeUndefined();
      expect(item.explanation).toBeUndefined();
    }
    const startedRes = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    expect(startedRes.status).toBe(201);
    const started = (await startedRes.json()) as {
      cursor: number;
      total: number;
      id?: unknown;
      userId?: unknown;
      current: { questionId: string; response: null; answerOptionIds?: unknown; answerCount?: unknown; explanation?: unknown };
      items: Array<{ questionId: string; response: null; answerCount?: unknown; id?: unknown; userId?: unknown }>;
    };
    expect(started.cursor).toBe(0);
    expect(started.total).toBe(4);
    expect(started).not.toHaveProperty('id');
    expect(started).not.toHaveProperty('userId');
    expect(started.current.answerOptionIds).toBeUndefined();
    expect(started.current.answerCount).toBe(1);
    expect(started.current.response).toBeNull();
    expect(started.items[0]).toMatchObject({ response: null });
    expect(started.items[0]?.answerCount).toBe(1);
    expect(started.items[0]).not.toHaveProperty('id');
    expect(started.items[0]).not.toHaveProperty('userId');
    const qid = started.current.questionId;
    const vid = `${qid}-v1`;
    const correct = [`${vid}-o2`];
    const ansRes = await req('/api/review/sessions/current/answers', {
      method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong', questionId: qid, response: { kind: 'answered', optionIds: correct } },
    });
    expect(ansRes.status).toBe(200);
    const ans = (await ansRes.json()) as { correct: boolean; graded: { questionId: string; explanation: string; correctOptionIds: string[] }; next: { questionId: string; answerOptionIds?: unknown; answerCount?: unknown } | null };
    expect(ans.correct).toBe(true);
    expect(ans.graded.questionId).toBe(qid);
    expect(ans.graded.explanation).toBe(`expl-${qid}`);
    expect(ans.graded.correctOptionIds).toEqual(correct);
    expect(ans.next?.answerOptionIds).toBeUndefined();
    expect(ans.next?.answerCount).toBe(1);
    const resumeRes = await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token });
    expect(resumeRes.status).toBe(200);
    const resume = (await resumeRes.json()) as { cursor: number };
    expect(resume.cursor).toBe(1);
    const row = await db.prepare("SELECT outcome FROM study_attempts WHERE source='review'").first<{ outcome: string }>();
    expect(row?.outcome).toBe('correct');
    const dup = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    expect(dup.status).toBe(409);
  });

  it('회차 questionVersionId가 questionId와 어긋나면 재개에서 404다', async () => {
    const token = await mintSession(U1);
    expect((await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } })).status).toBe(201);
    const row = await db.prepare('SELECT id, items FROM review_sessions WHERE user_id = ?1').bind(U1).first<{ id: string; items: string }>();
    if (!row) throw new Error('review session fixture missing');
    const items = JSON.parse(row.items) as Array<{ questionVersionId: string }>;
    const current = items[0];
    if (!current) throw new Error('review item fixture missing');
    current.questionVersionId = 'q-other-v1';
    await db.prepare('UPDATE review_sessions SET items = ?1 WHERE id = ?2').bind(JSON.stringify(items), row.id).run();
    const response = await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('타인 회차 404, 중복채점·경합 409, unknown_option 422', async () => {
    const owner = await mintSession(U1);
    const other = await mintSession(U2);
    await req('/api/review/sessions', { method: 'POST', token: owner, body: { examId: EXAM_CODE, mode: 'wrong' } });
    expect((await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token: other })).status).toBe(404);
    const cur = (await (await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token: owner })).json()) as { current: { questionId: string } };
    const qid = cur.current.questionId;
    expect((await req('/api/review/sessions/current/answers', { method: 'POST', token: other, body: { examId: EXAM_CODE, mode: 'wrong', questionId: qid, response: { kind: 'pass' } } })).status).toBe(404);
    expect((await req('/api/review/sessions/current/answers', { method: 'POST', token: owner, body: { examId: EXAM_CODE, mode: 'wrong', questionId: qid, response: { kind: 'answered', optionIds: ['nope'] } } })).status).toBe(422);
    const first = await req('/api/review/sessions/current/answers', { method: 'POST', token: owner, body: { examId: EXAM_CODE, mode: 'wrong', questionId: qid, response: { kind: 'pass' } } });
    expect(first.status).toBe(200);
    const retry = await req('/api/review/sessions/current/answers', { method: 'POST', token: owner, body: { examId: EXAM_CODE, mode: 'wrong', questionId: qid, response: { kind: 'pass' } } });
    expect([409, 404]).toContain(retry.status);
  });

  it('#308 단일 선택 문항에 2개 option 답변 요청은 422 invalid_selection_count로 거부되고 이력이 오염되지 않는다', async () => {
    const token = await mintSession(U1);
    const startedRes = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    expect(startedRes.status).toBe(201);
    const cur = (await (await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token })).json()) as { current: { questionId: string } };
    const qid = cur.current.questionId;
    const before = await db.prepare("SELECT COUNT(*) AS c FROM study_attempts WHERE source='review'").first<{ c: number }>();
    const bad = await req('/api/review/sessions/current/answers', {
      method: 'POST',
      token,
      body: { examId: EXAM_CODE, mode: 'wrong', questionId: qid, response: { kind: 'answered', optionIds: [`${qid}-v1-o1`, `${qid}-v1-o2`] } },
    });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: 'invalid_selection_count' });
    // 채점/이력 데이터 오염 없음 — attempt가 저장되지 않고 커서도 유지된다.
    const after = await db.prepare("SELECT COUNT(*) AS c FROM study_attempts WHERE source='review'").first<{ c: number }>();
    expect(after?.c).toBe(before?.c);
    const resume = (await (await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token })).json()) as { cursor: number };
    expect(resume.cursor).toBe(0);
    // 정상 1개 답변은 계속 받는다.
    const ok = await req('/api/review/sessions/current/answers', {
      method: 'POST',
      token,
      body: { examId: EXAM_CODE, mode: 'wrong', questionId: qid, response: { kind: 'answered', optionIds: [`${qid}-v1-o2`] } },
    });
    expect(ok.status).toBe(200);
  });

  it('연속 동시 POST는 1건 저장·409 1건', async () => {
    const token = await mintSession(U1);
    await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    const cur = (await (await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token })).json()) as { current: { questionId: string } };
    const qid = cur.current.questionId;
    const [a, b] = await Promise.all([
      req('/api/review/sessions/current/answers', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong', questionId: qid, response: { kind: 'pass' } } }),
      req('/api/review/sessions/current/answers', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong', questionId: qid, response: { kind: 'pass' } } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const cnt = await db.prepare("SELECT COUNT(*) AS c FROM study_attempts WHERE source='review'").first<{ c: number }>();
    expect(cnt?.c).toBe(1);
  });

  it('종료는 마지막 미채점 미기록·요약 반환', async () => {
    const token = await mintSession(U1);
    await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    const cur = (await (await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token })).json()) as { current: { questionId: string } };
    await req('/api/review/sessions/current/answers', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong', questionId: cur.current.questionId, response: { kind: 'pass' } } });
    const before = await db.prepare("SELECT COUNT(*) AS c FROM study_attempts WHERE source='review'").first<{ c: number }>();
    const endRes = await req('/api/review/sessions/current/end', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    expect(endRes.status).toBe(200);
    const end = (await endRes.json()) as { summary: { total: number; graded: number; pending: number } };
    expect(end.summary).toMatchObject({ total: 4, graded: 1, pending: 3 });
    const after = await db.prepare("SELECT COUNT(*) AS c FROM study_attempts WHERE source='review'").first<{ c: number }>();
    expect(after?.c).toBe(before?.c);
    expect((await req(`/api/review/sessions/current?examId=${EXAM_CODE}&mode=wrong`, { token })).status).toBe(404);
  });
});

describe('복습 HTTP 북마크 멱등', () => {
  it('set/unset 멱등→목록→bookmark 회차, 타시험 변경거부', async () => {
    const token = await mintSession(U1);
    const list0 = (await (await req(`/api/review/bookmarks?examId=${EXAM_CODE}`, { token })).json()) as { total: number };
    expect(list0.total).toBe(0);
    for (let i = 0; i < 2; i += 1) {
      const set = await req('/api/review/bookmarks', { method: 'PATCH', token, body: { examId: EXAM_CODE, questionId: 'q-0', bookmarked: true } });
      expect(set.status).toBe(200);
      expect((await set.json()) as { bookmarked: boolean }).toMatchObject({ bookmarked: true });
    }
    const list1 = (await (await req(`/api/review/bookmarks?examId=${EXAM_CODE}`, { token })).json()) as { total: number; items: Array<{ answerOptionIds?: unknown }> };
    expect(list1.total).toBe(1);
    expect(list1.items[0]?.answerOptionIds).toBeUndefined();
    const startBm = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'bookmark' } });
    expect(startBm.status).toBe(201);
    for (let i = 0; i < 2; i += 1) {
      const unset = await req('/api/review/bookmarks', { method: 'PATCH', token, body: { examId: EXAM_CODE, questionId: 'q-0', bookmarked: false } });
      expect(unset.status).toBe(200);
    }
    const list2 = (await (await req(`/api/review/bookmarks?examId=${EXAM_CODE}`, { token })).json()) as { total: number };
    expect(list2.total).toBe(0);
    expect((await req('/api/review/bookmarks', { method: 'PATCH', token, body: { examId: EXAM_CODE, questionId: 'q-other', bookmarked: true } })).status).toBe(422);
    expect((await req('/api/review/bookmarks', { method: 'PATCH', token, body: { examId: EXAM_CODE, questionId: 'missing-q', bookmarked: true } })).status).toBe(422);
  });
});


describe('복습 종료·답안 실효 경합 (ADR-0041)', () => {
  it('Given route가 cursor 0을 읽은 뒤 답안이 cursor 1을 저장 When 다음 문제 요청 Then stale snapshot은 409이고 문제를 잘못 채점하지 않는다', async () => {
    const token = await mintSession(U1);
    const start = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    const started = (await start.json()) as { items: Array<{ questionId: string }> };
    const firstId = started.items[0]?.questionId;
    const secondId = started.items[1]?.questionId;
    if (!firstId || !secondId) throw new Error('review fixture missing first two items');

    const raced = createRaceApp(async (deps, stale) => {
      const item = stale.items[stale.cursor];
      if (!item) throw new Error('review fixture missing current item');
      const result = await answerReviewItem(deps, { userId: U1, examId: EXAM_CODE, mode: 'wrong', questionId: item.questionId, response: { kind: 'pass' } });
      if (result.outcome !== 'answered') throw new Error('controlled concurrent answer did not commit');
    });
    const response = await req('/api/review/sessions/current/answers', {
      method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong', questionId: secondId, response: { kind: 'pass' } },
    }, raced);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'conflict' });
    const session = await db.prepare("SELECT status, cursor, items FROM review_sessions WHERE user_id = ?1 AND mode = 'wrong'").bind(U1).first<{ status: string; cursor: number; items: string }>();
    expect(session).toMatchObject({ status: 'active', cursor: 1 });
    expect(JSON.parse(session?.items ?? '[]')[0]?.state).toMatchObject({ kind: 'graded', response: { kind: 'pass' } });
    const attempts = await db.prepare("SELECT question_id FROM study_attempts WHERE source = 'review'").all<{ question_id: string }>();
    expect(attempts.results.map((row) => row.question_id)).toEqual([firstId]);
  });

  it('Given 답안이 먼저 commit된 stale 종료 snapshot When 다시 종료 Then 409 후 최신 cursor로 종료하며 attempt를 보존한다', async () => {
    const token = await mintSession(U1);
    const start = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    expect(start.status).toBe(201);
    const raced = createRaceApp(async (deps, stale) => {
      const item = stale.items[stale.cursor];
      if (!item) throw new Error('review fixture missing current item');
      const result = await answerReviewItem(deps, { userId: U1, examId: EXAM_CODE, mode: 'wrong', questionId: item.questionId, response: { kind: 'pass' } });
      if (result.outcome !== 'answered') throw new Error('controlled concurrent answer did not commit');
    });
    const endInput = { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } };
    const staleEnd = await req('/api/review/sessions/current/end', endInput, raced);
    expect(staleEnd.status).toBe(409);
    expect(await staleEnd.json()).toEqual({ error: 'conflict' });
    const afterConflict = await db.prepare("SELECT status, cursor, items FROM review_sessions WHERE user_id = ?1 AND mode = 'wrong'").bind(U1).first<{ status: string; cursor: number; items: string }>();
    expect(afterConflict).toMatchObject({ status: 'active', cursor: 1 });
    expect(JSON.parse(afterConflict?.items ?? '[]')[0]?.state).toMatchObject({ kind: 'graded', response: { kind: 'pass' } });
    expect((await db.prepare("SELECT COUNT(*) AS c FROM study_attempts WHERE source = 'review'").first<{ c: number }>())?.c).toBe(1);

    const retry = await req('/api/review/sessions/current/end', endInput);
    expect(retry.status).toBe(200);
    const ended = await db.prepare("SELECT status, cursor, items FROM review_sessions WHERE user_id = ?1 AND mode = 'wrong'").bind(U1).first<{ status: string; cursor: number; items: string }>();
    expect(ended).toMatchObject({ status: 'ended', cursor: 1 });
    expect(JSON.parse(ended?.items ?? '[]')[0]?.state).toMatchObject({ kind: 'graded', response: { kind: 'pass' } });
    expect((await db.prepare("SELECT COUNT(*) AS c FROM study_attempts WHERE source = 'review'").first<{ c: number }>())?.c).toBe(1);
  });

  it('Given 종료가 먼저 commit된 stale 답안 route When 제출 Then 409이며 attempt를 만들지 않는다', async () => {
    const token = await mintSession(U1);
    const start = await req('/api/review/sessions', { method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong' } });
    const started = (await start.json()) as { current: { questionId: string } };
    const questionId = started.current.questionId;
    const raced = createRaceApp(async (deps) => {
      const result = await endReviewSession(deps, { userId: U1, examId: EXAM_CODE, mode: 'wrong' });
      if (result.outcome !== 'ended') throw new Error('controlled concurrent end did not commit');
    });
    const answer = await req('/api/review/sessions/current/answers', {
      method: 'POST', token, body: { examId: EXAM_CODE, mode: 'wrong', questionId, response: { kind: 'pass' } },
    }, raced);
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ error: 'conflict' });
    const row = await db.prepare("SELECT status, cursor FROM review_sessions WHERE user_id = ?1 AND mode = 'wrong'").bind(U1).first<{ status: string; cursor: number }>();
    expect(row).toEqual({ status: 'ended', cursor: 0 });
    expect((await db.prepare("SELECT COUNT(*) AS c FROM study_attempts WHERE source = 'review'").first<{ c: number }>())?.c).toBe(0);
  });
});

describe('복습 회차 크기 size 계약 (4/8·기본 4·부분 출제·422, #275)', () => {
  const U8 = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000d1';
  const U4 = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000d2';
  const UDEF = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000d3';
  const UBAD = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000d4';

  /** seed20 문항(q-0~)에 오답 시도 count건을 심는다 — 후보가 정확히 count개가 된다. */
  async function seedWrong(userId: string, count: number): Promise<void> {
    const now = NOW();
    await db.prepare('INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(userId, now, now).run();
    for (let i = 0; i < count; i += 1) {
      const q = `q-${i}`;
      await db
        .prepare(
          "INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, ?2, 'e-1', ?3, ?4, 'wrong', ?5, 'set', ?6, NULL, 0)",
        )
        .bind(`w-${userId.slice(-4)}-${i}`, userId, q, `${q}-v1`, now * 1000 + i, `set-w-${userId.slice(-4)}-${i}`)
        .run();
    }
  }

  it('후보 5 + size 8 → 실제 5문항(가능한 만큼·중복 0)', async () => {
    const token = await mintSession(U8);
    await seedWrong(U8, 5);
    const res = await req('/api/review/sessions', {
      method: 'POST',
      token,
      body: { examId: EXAM_CODE, mode: 'wrong', size: 8 },
    });
    expect(res.status).toBe(201);
    const session = (await res.json()) as { total: number; items: Array<{ questionId: string }>; current: { questionId: string } | null };
    expect(session.total).toBe(5);
    expect(session.items).toHaveLength(5);
    expect(new Set(session.items.map((i) => i.questionId)).size).toBe(5);
    expect(session.current).not.toBeNull();
  });

  it('size 4 → 4문항, size 생략 → 기본 4문항', async () => {
    const t4 = await mintSession(U4);
    await seedWrong(U4, 5);
    const r4 = await req('/api/review/sessions', {
      method: 'POST',
      token: t4,
      body: { examId: EXAM_CODE, mode: 'wrong', size: 4 },
    });
    expect(r4.status).toBe(201);
    const s4 = (await r4.json()) as { total: number; items: unknown[] };
    expect(s4.total).toBe(4);
    expect(s4.items).toHaveLength(4);

    const td = await mintSession(UDEF);
    await seedWrong(UDEF, 5);
    const rd = await req('/api/review/sessions', {
      method: 'POST',
      token: td,
      body: { examId: EXAM_CODE, mode: 'wrong' },
    });
    expect(rd.status).toBe(201);
    const sd = (await rd.json()) as { total: number; items: unknown[] };
    expect(sd.total).toBe(4);
    expect(sd.items).toHaveLength(4);
  });

  it('size 3·9·"4"·null → 422', async () => {
    const token = await mintSession(UBAD);
    for (const size of [3, 9, '4', null]) {
      const res = await req('/api/review/sessions', {
        method: 'POST',
        token,
        body: { examId: EXAM_CODE, mode: 'wrong', size },
      });
      expect(res.status).toBe(422);
    }
  });
});
