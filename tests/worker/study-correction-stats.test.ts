import { env } from 'cloudflare:workers';
import { encrypt } from 'paseto-ts/v4';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRecord } from '@/app/stats/attempt-ports';
import { normalizePasetoLocalKey } from '@/infra/auth/session/keyring';
import { sha256Hex } from '@/infra/auth/session/crypto';
import type { StudySet, StudySetItem, StudySetResult } from '@/domain/study/types';
import { createApp } from '@/infra/http/app';
import { createD1StudyAttemptRepository } from '@/infra/persistence/study-attempt-repository';
import { createD1StudySetRepository } from '@/infra/persistence/study-repository';
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

// 이슈 #54 후속 — 관리 정정 API(#53)로 오답 attempt를 제외한 뒤 GET /api/study/stats가
// 제외분을 분모/첫 풀이에서 빼는지 실제 Hono+D1로 증명한다.
const db = env.DB;
const app = createApp();

const NOW = 1792320000;
const WRITE_TOKEN = `test-admin-write-${crypto.randomUUID()}`;
// 세션 토큰 sub는 UUID 불변식(isValidUserId) — 개념 사용자 u-1의 내부 UUID다.
const USER_ID = '10000000-0000-4000-8000-000000000001';

function randomBase64Key(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const KEY = randomBase64Key();
const testEnv = { ...env, PASETO_KEY_V1: KEY };

// 세션 행은 실제 현재 시각으로 발급한다(통계 라우트가 Date.now()로 만료를 검사한다).
async function mintSessionToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
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

function statsRequest(token: string) {
  return app.fetch(
    new Request('https://moi.test/api/study/stats?examId=e-1', {
      headers: { cookie: `__Host-moi_session=${token}` },
    }),
    testEnv,
  );
}

function correctionRequest(init: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers['authorization'] = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return app.fetch(
    new Request('https://moi.test/api/admin/study-sets/set-1/corrections', {
      method: init.method ?? 'POST',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    testEnv,
  );
}

function item(questionId: string, selected: string): StudySetItem {
  return {
    questionId,
    questionVersionId: `${questionId}-v1`,
    versionNo: 1,
    optionOrder: ['o-1', 'o-2'],
    answerOptionIds: ['o-1'],
    stem: 'stem',
    options: [
      { optionId: 'o-1', text: 'A' },
      { optionId: 'o-2', text: 'B' },
    ],
    explanation: 'exp',
    sourceUrls: [],
    response: { kind: 'answered', optionIds: [selected] },
  };
}

function submittedSet1(): StudySet {
  const result: StudySetResult = {
    answeredCount: 3,
    correctCount: 2,
    accuracyPercent: 67,
    passCount: 0,
    unansweredCount: 0,
    perItem: [
      { questionId: 'q-1', responseKind: 'answered', selectedOptionIds: ['o-1'], correctOptionIds: ['o-1'], correct: true },
      { questionId: 'q-2', responseKind: 'answered', selectedOptionIds: ['o-1'], correctOptionIds: ['o-1'], correct: true },
      { questionId: 'q-3', responseKind: 'answered', selectedOptionIds: ['o-2'], correctOptionIds: ['o-1'], correct: false },
    ],
  };
  return {
    id: 'set-1',
    userId: USER_ID,
    examId: 'e-1',
    mode: 'all',
    status: 'submitted',
    createdAt: NOW,
    submittedAt: NOW + 100,
    items: [item('q-1', 'o-1'), item('q-2', 'o-1'), item('q-3', 'o-2')],
    result,
  };
}

function attempt(over: Partial<AttemptRecord> & { attemptId: string; questionId: string }): AttemptRecord {
  return {
    userId: USER_ID,
    examId: 'e-1',
    questionVersionId: `${over.questionId}-v1`,
    outcome: 'correct',
    occurredAt: NOW + 100,
    source: 'set',
    sourceId: 'set-1',
    excludedAt: null,
    firstAttempt: true,
    ...over,
  };
}

async function seed(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind(USER_ID, NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'e-1', 'E1', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  for (const q of ['q-1', 'q-2', 'q-3']) {
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
  await createD1StudySetRepository(db).save({ set: submittedSet1() });
  await createD1StudyAttemptRepository(db).recordBatch({
    attempts: [
      attempt({ attemptId: 'a-1', questionId: 'q-1' }),
      attempt({ attemptId: 'a-2', questionId: 'q-2' }),
      attempt({ attemptId: 'a-3', questionId: 'q-3', outcome: 'wrong' }),
    ],
  });
  const { createD1AdminTokenRepository } = await import('@/infra/persistence/admin-token-repository');
  await createD1AdminTokenRepository(db).registerToken({ token: WRITE_TOKEN, actor: 'pipeline-test', scope: 'questions:write', now: NOW });
}

beforeAll(async () => {
  await applyD1Migrations(db, [
    migration0000, migration0001, migration0002, migration0003, migration0004, migration0005,
    migration0006, migration0007, migration0008, migration0009, migration0010,
  ]);
});

beforeEach(async () => {
  for (const t of [
    'study_attempts',
    'study_corrections',
    'study_set_items',
    'study_sets',
    'question_options',
    'question_versions',
    'questions',
    'audit_logs',
    'admin_idempotency',
    'admin_tokens',
    'exam_domains',
    'exams',
    'sessions',
    'users',
  ]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seed();
});

interface StatsBody {
  readonly overallAccuracy: number | null;
  readonly uniqueFirstSolved: number;
  readonly domains: ReadonlyArray<{
    readonly domainId: string;
    readonly gradedAttempts: number;
    readonly cumulativeAccuracy: number | null;
  }>;
}

type CorrectionBody = {
  readonly outcome: string;
  readonly corrected: {
    readonly validTotal: number;
    readonly accuracyPercent: number | null;
    readonly excludedCount: number;
  };
};

async function readStats(): Promise<StatsBody> {
  const res = await statsRequest(await mintSessionToken(USER_ID));
  expect(res.status).toBe(200);
  return (await res.json()) as StatsBody;
}

const validBody = { questionVersionId: 'q-3-v1', reason: 'answer-changed', source: 'recheck' };

describe('정정 적용 → 통계 제외 반영 (#54)', () => {
  it('정정 전 stats에 오답이 분모·첫 풀이에 포함된다(2/3·3)', async () => {
    const stats = await readStats();
    expect(stats.uniqueFirstSolved).toBe(3);
    expect(stats.overallAccuracy).toBeCloseTo(2 / 3, 5);
    expect(stats.domains[0]).toMatchObject({ domainId: 'd-1', gradedAttempts: 3 });
    expect(stats.domains[0]?.cumulativeAccuracy).toBeCloseTo(2 / 3, 5);
  });

  it('정정 적용 200 → stats가 제외분을 뺀다(1·2·2·1) + q-3만 excluded_at', async () => {
    const res = await correctionRequest({ token: WRITE_TOKEN, body: validBody });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CorrectionBody;
    expect(body.outcome).toBe('applied');
    expect(body.corrected).toMatchObject({ validTotal: 2, accuracyPercent: 100, excludedCount: 1 });

    const a3 = await db.prepare('SELECT excluded_at FROM study_attempts WHERE attempt_id = ?1').bind('a-3').first<{ excluded_at: number | null }>();
    expect(a3?.excluded_at).not.toBeNull();
    for (const id of ['a-1', 'a-2']) {
      const row = await db.prepare('SELECT excluded_at FROM study_attempts WHERE attempt_id = ?1').bind(id).first<{ excluded_at: number | null }>();
      expect(row?.excluded_at).toBeNull();
    }

    const stats = await readStats();
    expect(stats.overallAccuracy).toBe(1);
    expect(stats.uniqueFirstSolved).toBe(2);
    expect(stats.domains[0]).toMatchObject({ domainId: 'd-1', gradedAttempts: 2 });
    expect(stats.domains[0]?.cumulativeAccuracy).toBe(1);
  });

  it('같은 정정 재호출(duplicate) 후 stats는 동일하다', async () => {
    await correctionRequest({ token: WRITE_TOKEN, body: validBody });
    const dup = await correctionRequest({ token: WRITE_TOKEN, body: validBody });
    expect(dup.status).toBe(200);
    expect(((await dup.json()) as CorrectionBody).outcome).toBe('duplicate');

    const stats = await readStats();
    expect(stats.overallAccuracy).toBe(1);
    expect(stats.uniqueFirstSolved).toBe(2);
    expect(stats.domains[0]).toMatchObject({ domainId: 'd-1', gradedAttempts: 2 });
    expect(stats.domains[0]?.cumulativeAccuracy).toBe(1);
  });
});
