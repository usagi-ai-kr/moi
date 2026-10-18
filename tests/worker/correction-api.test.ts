import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRecord } from '@/app/stats/attempt-ports';
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

// 이슈 #53 정정 관리 API — admin Bearer write 인가·본문 검증·정정 적용 매핑을 실제 Hono+D1로 증명한다.
const db = env.DB;
const app = createApp();

const WRITE_TOKEN = `test-admin-write-${crypto.randomUUID()}`;
const READ_TOKEN = `test-admin-read-${crypto.randomUUID()}`;
const NOW = 1792320000;

function correctionRequest(
  setId: string,
  init: { method?: string; token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers['authorization'] = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return app.fetch(
    new Request(`https://moi.test/api/admin/study-sets/${setId}/corrections`, {
      method: init.method ?? 'POST',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    env,
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

function submittedSet(id: string, userId = 'u-1'): StudySet {
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
    id,
    userId,
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
    userId: 'u-1',
    examId: 'e-1',
    questionVersionId: `${over.questionId}-v1`,
    outcome: 'correct',
    occurredAt: NOW + 100,
    source: 'set',
    sourceId: 'set-1',
    excludedAt: null,
    firstAttempt: false,
    ...over,
  };
}

async function seed(): Promise<void> {
  await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?3)').bind('u-1', NOW, NOW).run();
  await db.prepare("INSERT INTO exams (id, code, name, created_at) VALUES ('e-1', 'saa-c03', 'SAA', ?1)").bind(NOW).run();
  await db.prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d-1', 'e-1', 'sec', 'sec', 100)").run();
  for (const q of ['q-1', 'q-2', 'q-3']) {
    await db
      .prepare("INSERT INTO questions (id, exam_id, domain_id, status, created_at, updated_at) VALUES (?1, 'e-1', 'd-1', 'active', ?2, ?2)")
      .bind(q, NOW)
      .run();
    for (const v of [1, 2]) {
      await db
        .prepare(
          "INSERT INTO question_versions (id, question_id, version_no, stem, explanation, source_urls, answer_option_ids, option_set_hash, review_status, created_at) VALUES (?1, ?2, ?3, 'stem', 'exp', '[]', '[]', 'h', 'pending', ?4)",
        )
        .bind(`${q}-v${v}`, q, v, NOW)
        .run();
    }
  }
  await db
    .prepare("INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at, submitted_at, result_json) VALUES ('set-2', 'u-1', 'e-1', 'all', 'active', ?1, NULL, NULL)")
    .bind(NOW)
    .run();
  await createD1StudySetRepository(db).save({ set: submittedSet('set-1') });
  await createD1StudyAttemptRepository(db).recordBatch({
    attempts: [
      attempt({ attemptId: 'a-1', questionId: 'q-1', firstAttempt: true }),
      attempt({ attemptId: 'a-2', questionId: 'q-2' }),
      attempt({ attemptId: 'a-3', questionId: 'q-3', outcome: 'wrong' }),
    ],
  });
  const { createD1AdminTokenRepository } = await import('@/infra/persistence/admin-token-repository');
  const tokens = createD1AdminTokenRepository(db);
  await tokens.registerToken({ token: WRITE_TOKEN, actor: 'pipeline-test', scope: 'questions:write', now: NOW });
  await tokens.registerToken({ token: READ_TOKEN, actor: 'viewer-test', scope: 'questions:read', now: NOW });
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
    migration0009,
    migration0010,
  ]);
});

beforeEach(async () => {
  for (const t of [
    'study_attempts',
    'study_corrections',
    'study_set_items',
    'study_sets',
    'question_versions',
    'questions',
    'audit_logs',
    'exam_domains',
    'exams',
    'admin_tokens',
    'admin_idempotency',
    'users',
  ]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seed();
});

const validBody = { questionVersionId: 'q-3-v1', reason: 'answer-changed', source: 'recheck' };

describe('정정 관리 API (#53)', () => {
  it('write 토큰 applied 200 + 정정 1행·시도 제외·재호출 duplicate', async () => {
    const res = await correctionRequest('set-1', { token: WRITE_TOKEN, body: validBody });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { outcome: string; corrected: { excludedQuestionVersionIds: string[] } };
    expect(body.outcome).toBe('applied');
    expect(body.corrected.excludedQuestionVersionIds).toEqual(['q-3-v1']);
    const count = await db.prepare('SELECT COUNT(*) AS c FROM study_corrections WHERE set_id = ?1').bind('set-1').first<{ c: number }>();
    expect(count?.c).toBe(1);
    const excluded = await db.prepare('SELECT excluded_at FROM study_attempts WHERE attempt_id = ?1').bind('a-3').first<{ excluded_at: number | null }>();
    expect(excluded?.excluded_at).not.toBeNull();
    const dup = await correctionRequest('set-1', { token: WRITE_TOKEN, body: validBody });
    expect(dup.status).toBe(200);
    expect(((await dup.json()) as { outcome: string }).outcome).toBe('duplicate');
  });

  it('read 토큰은 403, 미지 토큰·토큰 없음은 401이다', async () => {
    expect((await correctionRequest('set-1', { token: READ_TOKEN, body: validBody })).status).toBe(403);
    expect((await correctionRequest('set-1', { token: 'unknown-token-xyz', body: validBody })).status).toBe(401);
    expect((await correctionRequest('set-1', { body: validBody })).status).toBe(401);
  });

  it('없는 세트는 404, 미제출 세트는 409, 세트 밖 개정은 422이다', async () => {
    expect((await correctionRequest('missing-set', { token: WRITE_TOKEN, body: validBody })).status).toBe(404);
    expect((await correctionRequest('set-2', { token: WRITE_TOKEN, body: validBody })).status).toBe(409);
    const bad = await correctionRequest('set-1', {
      token: WRITE_TOKEN,
      body: { questionVersionId: 'q-1-v2', reason: 'x', source: 'admin' },
    });
    expect(bad.status).toBe(422);
    expect((await bad.json()) as { error: string }).toMatchObject({ error: 'version_not_in_set' });
  });

  it('잘못된 source·빈 본문은 422 validation_failed다', async () => {
    const badSource = await correctionRequest('set-1', {
      token: WRITE_TOKEN,
      body: { questionVersionId: 'q-3-v1', reason: 'x', source: 'nope' },
    });
    expect(badSource.status).toBe(422);
    const empty = await correctionRequest('set-1', { token: WRITE_TOKEN, body: {} });
    expect(empty.status).toBe(422);
  });
});
