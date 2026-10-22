import { env } from 'cloudflare:workers';
import { encrypt } from 'paseto-ts/v4';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizePasetoLocalKey } from '@/infra/auth/session/keyring';
import { sha256Hex } from '@/infra/auth/session/crypto';
import { createApp } from '@/infra/http/app';
import { createD1ConceptRecommendationSource } from '@/infra/persistence/concept-recommendation-repository';
import catalog from '../../content/concepts/saa-c03/catalog.json';
import sec01 from '../../content/questions/saa-c03/sec-01.json';
import sec02 from '../../content/questions/saa-c03/sec-02.json';
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

const db = env.DB;
const USER_A = '0f9f1a3e-6f1a-4c2e-8f0b-000000000329';
const USER_B = '0f9f1a3e-6f1a-4c2e-8f0b-000000000330';
const NOW = Date.now();

function randomBase64Key(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const KEY = randomBase64Key();
const testEnv = {
  ...env,
  PASETO_KEY_V1: KEY,
  KAKAO_CLIENT_ID: FAKE_CLIENT_ID,
  KAKAO_CLIENT_SECRET: FAKE_CLIENT_SECRET,
  KAKAO_REDIRECT_URI: FAKE_REDIRECT_URI,
} as unknown as Env;
const app = createApp();

async function mintSession(userId: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  await db.prepare('INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?2)').bind(userId, nowSec).run();
  const jti = crypto.randomUUID();
  await db.prepare('INSERT INTO sessions (jti_hash, user_id, issued_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256Hex(jti), userId, nowSec, nowSec + 3600).run();
  return encrypt(
    normalizePasetoLocalKey(KEY),
    { sub: userId, jti, iat: new Date(Date.now()).toISOString(), exp: new Date(Date.now() + 3600_000).toISOString() },
    { validatePayload: false },
  );
}

async function request(path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `__Host-moi_session=${token}`;
  return app.fetch(new Request(`https://moi.test${path}`, { headers }), testEnv);
}

function itemStem(pack: typeof sec01, index: number): { questionId: string; stem: string } {
  const item = pack.items[index];
  if (!item) throw new Error(`fixture item missing: ${pack.packId}[${index}]`);
  return { questionId: item.questionId, stem: item.stem };
}

async function insertQuestion(input: { id: string; examId: string; domainId: string; stem: string; status?: string }): Promise<string> {
  const versionId = `${input.id}-v1`;
  const nowSec = Math.floor(Date.now() / 1000);
  await db.prepare('INSERT INTO questions (id, exam_id, domain_id, status, current_version_no, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)')
    .bind(input.id, input.examId, input.domainId, input.status ?? 'active', nowSec).run();
  await db.prepare("INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, 1, ?3, '설명', '[]', '[]', 'hash', 'approved', ?4)")
    .bind(versionId, input.id, input.stem, nowSec).run();
  return versionId;
}

async function insertAttempt(input: {
  id: string;
  userId: string;
  examId: string;
  questionId: string;
  versionId: string;
  outcome: 'wrong' | 'correct' | 'pass' | 'unanswered';
  occurredAt?: number;
  excludedAt?: number | null;
}): Promise<void> {
  await db.prepare("INSERT INTO study_attempts (attempt_id, user_id, exam_id, question_id, question_version_id, outcome, occurred_at, source, source_id, excluded_at, first_attempt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'set', ?8, ?9, 0)")
    .bind(input.id, input.userId, input.examId, input.questionId, input.versionId, input.outcome, input.occurredAt ?? NOW, `set-${input.id}`, input.excludedAt ?? null).run();
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008, migration0009, migration0010, migration0011, migration0012, migration0013]);
});

beforeEach(async () => {
  for (const table of ['study_attempts', 'review_bookmarks', 'review_sessions', 'question_options', 'question_versions', 'questions', 'sessions']) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
  for (const table of ['users', 'exam_domains', 'exams']) await db.prepare(`DELETE FROM ${table}`).run();
  const nowSec = Math.floor(Date.now() / 1000);
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?2), (?3, ?2, ?2)').bind(USER_A, nowSec, USER_B).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('exam-saa', 'saa-c03', 'SAA', ?1), ('exam-sap', 'sap-c02', 'SAP', ?1)").bind(nowSec).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('domain-saa-security', 'exam-saa', 'security', '보안', 100), ('domain-sap-security', 'exam-sap', 'security', '보안', 100)").run();

  const qWrong = itemStem(sec01, 0);
  const qBookmark = itemStem(sec01, 1);
  const qOtherUser = itemStem(sec02, 0);
  const qCorrected = itemStem(sec01, 2);
  const qExcluded = itemStem(sec01, 3);
  const wrongVersion = await insertQuestion({ id: 'q-runtime-wrong', examId: 'exam-saa', domainId: 'domain-saa-security', stem: qWrong.stem });
  await insertQuestion({ id: 'q-runtime-bookmark', examId: 'exam-saa', domainId: 'domain-saa-security', stem: qBookmark.stem });
  const otherUserVersion = await insertQuestion({ id: 'q-runtime-other-user', examId: 'exam-saa', domainId: 'domain-saa-security', stem: qOtherUser.stem });
  const correctedVersion = await insertQuestion({ id: 'q-runtime-corrected', examId: 'exam-saa', domainId: 'domain-saa-security', stem: qCorrected.stem });
  const excludedVersion = await insertQuestion({ id: 'q-runtime-excluded', examId: 'exam-saa', domainId: 'domain-saa-security', stem: qExcluded.stem });
  const otherExamVersion = await insertQuestion({ id: 'q-runtime-other-exam', examId: 'exam-sap', domainId: 'domain-sap-security', stem: qWrong.stem });
  const inactiveVersion = await insertQuestion({ id: 'q-runtime-inactive', examId: 'exam-saa', domainId: 'domain-saa-security', stem: itemStem(sec01, 4).stem, status: 'inactive' });

  await insertAttempt({ id: 'attempt-a-wrong-1', userId: USER_A, examId: 'exam-saa', questionId: 'q-runtime-wrong', versionId: wrongVersion, outcome: 'wrong', occurredAt: NOW - 1000 });
  await insertAttempt({ id: 'attempt-a-wrong-2', userId: USER_A, examId: 'exam-saa', questionId: 'q-runtime-wrong', versionId: wrongVersion, outcome: 'pass', occurredAt: NOW });
  await insertAttempt({ id: 'attempt-b-wrong', userId: USER_B, examId: 'exam-saa', questionId: 'q-runtime-other-user', versionId: otherUserVersion, outcome: 'wrong' });
  await insertAttempt({ id: 'attempt-a-corrected-wrong', userId: USER_A, examId: 'exam-saa', questionId: 'q-runtime-corrected', versionId: correctedVersion, outcome: 'wrong', occurredAt: NOW - 2000 });
  await insertAttempt({ id: 'attempt-a-corrected-correct', userId: USER_A, examId: 'exam-saa', questionId: 'q-runtime-corrected', versionId: correctedVersion, outcome: 'correct', occurredAt: NOW - 1000 });
  await insertAttempt({ id: 'attempt-a-excluded', userId: USER_A, examId: 'exam-saa', questionId: 'q-runtime-excluded', versionId: excludedVersion, outcome: 'wrong', excludedAt: nowSec });
  await insertAttempt({ id: 'attempt-a-other-exam', userId: USER_A, examId: 'sap-c02', questionId: 'q-runtime-other-exam', versionId: otherExamVersion, outcome: 'wrong' });
  await insertAttempt({ id: 'attempt-a-inactive', userId: USER_A, examId: 'saa-c03', questionId: 'q-runtime-inactive', versionId: inactiveVersion, outcome: 'wrong' });

  await db.prepare('INSERT INTO review_bookmarks (user_id, question_id, created_at) VALUES (?1, ?2, ?3), (?4, ?5, ?3), (?6, ?7, ?3)')
    .bind(USER_A, 'q-runtime-wrong', nowSec, USER_A, 'q-runtime-bookmark', USER_B, 'q-runtime-other-user').run();
});

describe('개념 추천 Worker 경로 (#329)', () => {
  it('제출 오답과 북마크를 합치고 정정·제외·비활성·다른 시험·다른 계정을 분리한다', async () => {
    const source = createD1ConceptRecommendationSource(db);
    const userA = await source.listUserSignals({ userId: USER_A, examCode: 'saa-c03' });
    expect(userA.map((signal) => signal.questionId)).toEqual(['q-runtime-wrong', 'q-runtime-bookmark']);
    expect(userA[0]).toMatchObject({ validWrongCount: 2, bookmarked: true, sourceQuestionId: 'saa-sec-0001' });
    expect(userA[1]).toMatchObject({ validWrongCount: 0, bookmarked: true, sourceQuestionId: 'saa-sec-0002' });
    expect(await source.listUserSignals({ userId: USER_B, examCode: 'saa-c03' })).toMatchObject([
      { questionId: 'q-runtime-other-user', sourceQuestionId: 'saa-sec-0026', bookmarked: true },
    ]);
    expect(await source.listUserSignals({ userId: USER_A, examCode: 'sap-c02' })).toEqual([]);
  });

  it('API는 인증 사용자·현재 시험의 요약만 제공하고 UUID를 노출하지 않는다', async () => {
    const unauthenticated = await request('/api/concepts/recommendations?examId=saa-c03');
    expect(unauthenticated.status).toBe(401);

    const tokenA = await mintSession(USER_A);
    const recommendations = await request('/api/concepts/recommendations?examId=saa-c03', tokenA);
    expect(recommendations.status).toBe(200);
    const body = await recommendations.json() as { total: number; reviewedContentAvailable: boolean; items: Array<{ conceptId: string; reason: string; relatedQuestionCount: number }> };
    const mappedConcept = catalog.concepts.find((concept) => concept.packId === sec01.packId);
    expect(body).toMatchObject({ total: 1, reviewedContentAvailable: true });
    expect(body.items[0]).toMatchObject({ conceptId: mappedConcept?.id, relatedQuestionCount: 2 });
    expect(JSON.stringify(body)).not.toContain('q-runtime');

    const detailResponse = await request(`/api/concepts/${mappedConcept?.id}?examId=saa-c03`, tokenA);
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as { relatedQuestions: Array<{ stem: string }> };
    expect(detail.relatedQuestions.map((question) => question.stem)).toEqual([itemStem(sec01, 0).stem, itemStem(sec01, 1).stem]);

    const tokenB = await mintSession(USER_B);
    const userBDetailResponse = await request(`/api/concepts/${mappedConcept?.id}?examId=saa-c03`, tokenB);
    const userBDetail = await userBDetailResponse.json() as { relatedQuestions: Array<{ stem: string }> };
    expect(userBDetail.relatedQuestions).toEqual([]);
    const otherConcept = catalog.concepts.find((concept) => concept.packId === sec02.packId);
    const otherConceptResponse = await request(`/api/concepts/${otherConcept?.id}?examId=saa-c03`, tokenB);
    const otherConceptDetail = await otherConceptResponse.json() as { relatedQuestions: Array<{ stem: string }> };
    expect(otherConceptDetail.relatedQuestions.map((question) => question.stem)).toEqual([itemStem(sec02, 0).stem]);

    const unsupported = await request('/api/concepts/recommendations?examId=sap-c02', tokenA);
    expect(await unsupported.json()).toMatchObject({ total: 0, reviewedContentAvailable: false, items: [] });
  });
});
