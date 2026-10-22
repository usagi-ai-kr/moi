import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
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

// 500문항 청킹 회귀 (브리프 500-pool-chunking).
// D1 bound parameter 상한(100)을 래퍼로 강제한다: chunking 없이
// 130문항을 한 번에 inArray로 조회하면 bind 인자가 100을 넘어 throw한다.
const BOUND_LIMIT = 100;
const QUESTION_COUNT = 130;
const EXAM_CODE = 'chunk-exam';

const db = env.DB;
const NOW = () => Math.floor(Date.now() / 1000);

function withBoundLimit(database: D1Database, limit: number): D1Database {
  const wrapStmt = (stmt: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(stmt, {
      get(target, prop) {
        if (prop === 'bind') {
          return (...args: unknown[]) => {
            if (args.length > limit) throw new Error(`too many bound parameters: ${args.length} > ${limit}`);
            return (target.bind as (...a: unknown[]) => unknown)(...args);
          };
        }
        const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as unknown as D1PreparedStatement;
  return new Proxy(database, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (query: string) => wrapStmt((target.prepare as (q: string) => D1PreparedStatement).call(target, query));
      }
      const value = (target as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as unknown as D1Database;
}

async function seedChunkExam(): Promise<void> {
  for (const t of [
    'study_set_items',
    'study_sets',
    'question_options',
    'question_versions',
    'questions',
    'exam_domains',
    'exams',
  ]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  const bank = createD1QuestionBankRepository(db);
  await bank.insertExam({ id: 'exam-chunk', code: EXAM_CODE, name: EXAM_CODE, now: NOW() });
  await bank.insertDomain({ id: 'dom-chunk-sec', examId: 'exam-chunk', code: 'security', name: '보안', weight: 60 });
  await bank.insertDomain({ id: 'dom-chunk-res', examId: 'exam-chunk', code: 'resilience', name: '복원력', weight: 40 });
  for (let i = 0; i < QUESTION_COUNT; i += 1) {
    const qid = `q-chunk-${i}`;
    const domainId = i % 2 === 0 ? 'dom-chunk-sec' : 'dom-chunk-res';
    await bank.insertQuestion({ id: qid, examId: 'exam-chunk', domainId, now: NOW() });
    const optionIds = [`${qid}-a`, `${qid}-b`, `${qid}-c`, `${qid}-d`];
    await bank.insertVersion({
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
  await applyD1Migrations(db, [
    migration0000,
    migration0001,
    migration0002,
    migration0003,
    migration0004,
    migration0005,
    migration0006,
    migration0009,
  ]);
});

describe('study-pool 청킹 (500문항 대비)', () => {
  it('130문항 풀을 bound 100 상한 안에서 전량 반환한다', async () => {
    await seedChunkExam();
    const pool = createD1QuestionPool(withBoundLimit(db, BOUND_LIMIT), EXAM_CODE);
    const entries = await pool.listPool({ userId: 'chunk-test-user' });
    expect(entries).toHaveLength(QUESTION_COUNT);
    const ids = new Set(entries.map((e) => e.questionId));
    expect(ids.size).toBe(QUESTION_COUNT);
    for (const entry of entries) {
      expect(entry.version.options).toHaveLength(4);
      expect(entry.version.stem.length).toBeGreaterThan(0);
      expect(entry.version.optionIds).toHaveLength(4);
    }
  });
});
