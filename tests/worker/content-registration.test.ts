import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAdminRuntime } from '@/infra/http/admin/runtime';
import { registerAdminRoutes } from '@/infra/http/admin/routes';
import { createD1AdminTokenRepository } from '@/infra/persistence/admin-token-repository';
import { createD1QuestionBankRepository } from '@/infra/persistence/d1-question-bank-repository';
import { createD1QuestionPool } from '@/infra/persistence/study-pool';
import migration0000 from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import migration0001 from '../../drizzle/migrations/0001_add-users-external-identities.sql?raw';
import migration0002 from '../../drizzle/migrations/0002_add-sessions.sql?raw';
import migration0003 from '../../drizzle/migrations/0003_add-question-bank.sql?raw';
import migration0004 from '../../drizzle/migrations/0004_add-admin-api.sql?raw';
import migration0005 from '../../drizzle/migrations/0005_add-study-sets.sql?raw';
import migration0006 from '../../drizzle/migrations/0006_add-study-item-content.sql?raw';
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #134 — 500문항 로컬 등록 리허설.
// content/questions/saa-c03/*.json(20팩·500문항)을 관리 API bulk로 D1에 등록하고
// 멱등 재실행·건수·도메인 분포·정답/근거 저장을 실제 Hono+D1로 검증한다.
// 500문항이 준비되기 전에는 skip하고 로그만 남긴다(팩 추가는 별도 이슈).

interface ContentItem {
  readonly questionId: string;
  readonly domainCode: string;
  readonly stem: string;
  readonly explanation: string;
  readonly sourceUrls: readonly string[];
  readonly answerOptionKeys: readonly string[];
  readonly options: ReadonlyArray<{ readonly optionKey: string; readonly text: string }>;
}

interface ContentPack {
  readonly packId: string;
  readonly examCode: string;
  readonly items: readonly ContentItem[];
}

interface BulkItem {
  readonly examCode: string;
  readonly domainCode: string;
  readonly stem: string;
  readonly explanation: string;
  readonly sourceUrls: readonly string[];
  readonly answerOptionKeys: readonly string[];
  readonly optionSetHash: string;
  readonly options: ReadonlyArray<{ readonly optionKey: string; readonly text: string }>;
}

const EXPECTED_PACKS = 21;
const EXPECTED_QUESTIONS = 500;
const CHUNK_SIZE = 100;

const contentModules = import.meta.glob('../../content/questions/saa-c03/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, ContentPack>;

const packs = Object.entries(contentModules)
  .filter(([path]) => !path.endsWith('/sample-pack.json'))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, pack]) => pack);
const totalQuestions = packs.reduce((sum, pack) => sum + pack.items.length, 0);
const CONTENT_READY = packs.length === EXPECTED_PACKS && totalQuestions === EXPECTED_QUESTIONS;

if (!CONTENT_READY) {
  console.warn(
    `[content-registration] skip: packs=${packs.length}/${EXPECTED_PACKS} questions=${totalQuestions}/${EXPECTED_QUESTIONS}`,
  );
}

const describeContent = CONTENT_READY ? describe : describe.skip;

const db = env.DB;
const NOW = 1792310000;
const WRITE_TOKEN = `test-content-write-${crypto.randomUUID()}`;

const app = new Hono<{ Bindings: Env }>();
registerAdminRoutes(app, { createRuntime: (e) => createAdminRuntime(e, 'req-content-test') });

function bulkRequest(key: string, items: readonly BulkItem[]) {
  return app.fetch(
    new Request('https://moi.test/api/admin/questions/bulk', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${WRITE_TOKEN}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ items }),
    }),
    env,
  );
}

async function tableCount(table: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>();
  return row?.c ?? 0;
}

/** Web Crypto 기반 SHA-256 hex — 결정적 optionSetHash·Idempotency-Key 생성용(node:crypto 금지). */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sortedOptions(options: ContentItem['options']) {
  return [...options].sort((a, b) => a.optionKey.localeCompare(b.optionKey));
}

async function toBulkItem(pack: ContentPack, item: ContentItem): Promise<BulkItem> {
  const canonical = JSON.stringify(sortedOptions(item.options));
  return {
    examCode: pack.examCode,
    domainCode: item.domainCode,
    stem: item.stem,
    explanation: item.explanation,
    sourceUrls: item.sourceUrls,
    answerOptionKeys: item.answerOptionKeys,
    optionSetHash: await sha256Hex(`${item.questionId}\n${canonical}`),
    options: item.options.map((o) => ({ optionKey: o.optionKey, text: o.text })),
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function seed(): Promise<void> {
  const questions = createD1QuestionBankRepository(db);
  await questions.insertExam({ id: 'exam-saa', code: 'saa-c03', name: 'AWS SAA-C03', now: NOW });
  const domains = [
    ['dom-sec', 'security', '보안', 30],
    ['dom-res', 'resilience', '복원력', 26],
    ['dom-perf', 'performance', '성능', 24],
    ['dom-cost-optimization', 'cost-optimization', '비용 최적화', 20],
  ] as const;
  for (const [id, code, name, weight] of domains) {
    await questions.insertDomain({ id, examId: 'exam-saa', code, name, weight });
  }
  const tokens = createD1AdminTokenRepository(db);
  await tokens.registerToken({
    token: WRITE_TOKEN,
    actor: 'content-pipeline-test',
    scope: 'questions:write',
    now: NOW,
  });
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
  ]);
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 강제 여부는 D1이 결정한다.
  }
});

beforeEach(async () => {
  for (const t of [
    'question_options',
    'question_versions',
    'questions',
    'audit_logs',
    'exam_domains',
    'exams',
    'admin_idempotency',
    'admin_tokens',
  ]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seed();
});

describeContent('500문항 로컬 등록 리허설', () => {
  it(
    '5청크 bulk 등록 후 멱등 재실행·건수·도메인 분포·정답/근거 저장을 검증한다',
    { timeout: 180_000 },
    async () => {
      const entries = packs.flatMap((pack) => pack.items.map((item) => ({ pack, item })));
      const payloadItems = await Promise.all(entries.map(({ pack, item }) => toBulkItem(pack, item)));
      expect(payloadItems).toHaveLength(EXPECTED_QUESTIONS);

      const chunks = chunk(payloadItems, CHUNK_SIZE);
      expect(chunks).toHaveLength(EXPECTED_QUESTIONS / CHUNK_SIZE);

      const keys: string[] = [];
      const firstRun: Array<Array<{ questionId: string; versionId: string; versionNo: number }>> = [];

      for (const [index, items] of chunks.entries()) {
        const key = `content-${index}-${await sha256Hex(JSON.stringify(items))}`;
        keys.push(key);
        const res = await bulkRequest(key, items);
        expect(res.status).toBe(201);
        const body = await res.json<{
          created: Array<{ questionId: string; versionId: string; versionNo: number }>;
        }>();
        expect(body.created).toHaveLength(items.length);
        firstRun.push(body.created);
      }

      expect(await tableCount('questions')).toBe(EXPECTED_QUESTIONS);
      expect(await tableCount('question_versions')).toBe(EXPECTED_QUESTIONS);
      expect(await tableCount('question_options')).toBe(EXPECTED_QUESTIONS * 4);
      expect(await tableCount('audit_logs')).toBe(EXPECTED_QUESTIONS);

      // 같은 key·같은 payload 재실행 — 저장 결과를 재현하고 중복 저장하지 않는다.
      for (const [index, items] of chunks.entries()) {
        const res = await bulkRequest(keys[index], items);
        expect(res.status).toBe(201);
        const body = await res.json<{
          created: Array<{ questionId: string; versionId: string; versionNo: number }>;
        }>();
        expect(body.created).toEqual(firstRun[index]);
      }

      expect(await tableCount('questions')).toBe(EXPECTED_QUESTIONS);
      expect(await tableCount('question_versions')).toBe(EXPECTED_QUESTIONS);
      expect(await tableCount('question_options')).toBe(EXPECTED_QUESTIONS * 4);
      expect(await tableCount('audit_logs')).toBe(EXPECTED_QUESTIONS);

      // 도메인 분포: security 150 · resilience 130 · performance 120 · cost-optimization 100.
      const domainRows = await db
        .prepare(
          `SELECT d.code AS code, COUNT(q.id) AS count
           FROM questions q JOIN exam_domains d ON d.id = q.domain_id
           GROUP BY d.code`,
        )
        .all<{ code: string; count: number }>();
      const domainCounts = Object.fromEntries(domainRows.results.map((r) => [r.code, r.count]));
      expect(domainCounts).toEqual({
        security: 150,
        resilience: 130,
        performance: 120,
        'cost-optimization': 100,
      });

      // 임의 1문항 — stem/explanation/source_urls/정답 option id가 content 원본과 일치한다.
      const sample = payloadItems.find((item) => item.answerOptionKeys.length > 1) ?? payloadItems[0];
      const versionRow = await db
        .prepare(
          `SELECT stem, explanation, source_urls AS sourceUrls, answer_option_ids AS answerOptionIds, option_set_hash AS optionSetHash
           FROM question_versions WHERE stem = ? LIMIT 1`,
        )
        .bind(sample.stem)
        .first<{
          stem: string;
          explanation: string;
          sourceUrls: string;
          answerOptionIds: string;
          optionSetHash: string;
        }>();
      expect(versionRow).not.toBeNull();
      expect(versionRow?.stem).toBe(sample.stem);
      expect(versionRow?.explanation).toBe(sample.explanation);
      expect(JSON.parse(versionRow?.sourceUrls ?? '[]')).toEqual(sample.sourceUrls);
      expect(versionRow?.optionSetHash).toBe(sample.optionSetHash);

      const answerIds = JSON.parse(versionRow?.answerOptionIds ?? '[]') as string[];
      expect(answerIds).toHaveLength(sample.answerOptionKeys.length);
      const placeholders = answerIds.map(() => '?').join(',');
      const answerRow = await db
        .prepare(`SELECT option_key AS optionKey FROM question_options WHERE id IN (${placeholders})`)
        .bind(...answerIds)
        .all<{ optionKey: string }>();
      expect(new Set(answerRow.results.map((r) => r.optionKey))).toEqual(
        new Set(sample.answerOptionKeys),
      );

      // 출제 풀 어댑터가 500문항을 반환하고, 정답 id가 보기 id의 부분집합이다.
      const pool = await createD1QuestionPool(db, 'saa-c03').listPool();
      expect(pool).toHaveLength(EXPECTED_QUESTIONS);
      for (const entry of pool) {
        expect(entry.version.answerOptionIds.length).toBeGreaterThan(0);
        for (const answerId of entry.version.answerOptionIds) {
          expect(entry.version.optionIds).toContain(answerId);
        }
      }
    },
  );
});
