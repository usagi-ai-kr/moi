import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAdminRoutes } from '@/infra/http/admin/routes';
import { createAdminRuntime } from '@/infra/http/admin/runtime';
import { createApp } from '@/infra/http/app';
import { createD1QuestionBankRepository } from '@/infra/persistence/d1-question-bank-repository';
import migration0000 from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import migration0001 from '../../drizzle/migrations/0001_add-users-external-identities.sql?raw';
import migration0002 from '../../drizzle/migrations/0002_add-sessions.sql?raw';
import migration0003 from '../../drizzle/migrations/0003_add-question-bank.sql?raw';
import migration0004 from '../../drizzle/migrations/0004_add-admin-api.sql?raw';
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #47 (ADR-0019) Worker+D1 통합 테스트 — 관리 토큰 인증/인가·
// 멱등·원자성·검증·비활성화·감사·로그 redaction을 실제 Hono+D1로 증명한다.

const db = env.DB;

const capturedLogs: string[] = [];
const app = new Hono<{ Bindings: Env }>();
registerAdminRoutes(app, {
  createRuntime: (e) => createAdminRuntime(e, 'req-test', (line) => capturedLogs.push(line)),
});

const WRITE_TOKEN = `test-admin-write-${crypto.randomUUID()}`;
const READ_TOKEN = `test-admin-read-${crypto.randomUUID()}`;
const REVOKED_TOKEN = `test-admin-revoked-${crypto.randomUUID()}`;

const NOW = 1792310000;

function adminRequest(
  path: string,
  init: { method?: string; token?: string; key?: string; body?: unknown; query?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers['authorization'] = `Bearer ${init.token}`;
  if (init.key !== undefined) headers['idempotency-key'] = init.key;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return app.fetch(
    new Request(`https://moi.test${path}${init.query ?? ''}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    env,
  );
}

function bulkItem(domainCode: string, stem: string, answerKeys = ['A', 'C']) {
  return {
    examCode: 'saa-c03',
    domainCode,
    stem,
    explanation: `해설: ${stem}`,
    sourceUrls: ['https://docs.aws.amazon.com/x'],
    answerOptionKeys: answerKeys,
    optionSetHash: `hash-${stem}`,
    options: [
      { optionKey: 'A', text: `보기 A (${stem})` },
      { optionKey: 'B', text: `보기 B (${stem})` },
      { optionKey: 'C', text: `보기 C (${stem})` },
      { optionKey: 'D', text: `보기 D (${stem})` },
    ],
  };
}

async function tableCount(table: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>();
  return row?.c ?? 0;
}

async function seed(): Promise<void> {
  const questions = createD1QuestionBankRepository(db);
  await questions.insertExam({ id: 'exam-saa', code: 'saa-c03', name: 'AWS SAA-C03', now: NOW });
  const domains = [
    ['dom-sec', 'security', '보안', 30],
    ['dom-res', 'resilience', '복원력', 26],
    ['dom-perf', 'performance', '성능', 24],
    ['dom-cost', 'cost', '비용 최적화', 20],
  ] as const;
  for (const [id, code, name, weight] of domains) {
    await questions.insertDomain({ id, examId: 'exam-saa', code, name, weight });
  }
  const { createD1AdminTokenRepository } = await import('@/infra/persistence/admin-token-repository');
  const tokens = createD1AdminTokenRepository(db);
  await tokens.registerToken({ token: WRITE_TOKEN, actor: 'pipeline-test', scope: 'questions:write', now: NOW });
  await tokens.registerToken({ token: READ_TOKEN, actor: 'viewer-test', scope: 'questions:read', now: NOW });
  await tokens.registerToken({ token: REVOKED_TOKEN, actor: 'revoked-test', scope: 'questions:write', now: NOW });
  await tokens.revokeToken({ actor: 'revoked-test', now: NOW + 1 });
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003, migration0004]);
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 테스트가 실제 강제 여부를 드러낸다.
  }
});

beforeEach(async () => {
  capturedLogs.length = 0;
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

describe('인증·인가', () => {
  it('토큰 없음·형식 오류·미지·폐기 토큰은 401이다', async () => {
    expect((await adminRequest('/api/admin/questions/q-1')).status).toBe(401);
    expect((await adminRequest('/api/admin/questions/q-1', { token: 'not-bearer' })).status).toBe(401);
    expect((await adminRequest('/api/admin/questions/q-1', { token: 'unknown-token-xyz' })).status).toBe(401);
    expect((await adminRequest('/api/admin/questions/q-1', { token: REVOKED_TOKEN })).status).toBe(401);
  });

  it('사용자 PASETO 형태 토큰도 401이다(관리 토큰과 분리)', async () => {
    const res = await adminRequest('/api/admin/questions/q-1', { token: 'v4.local.fake-paseto-payload' });
    expect(res.status).toBe(401);
  });

  it('read 스코프로 쓰기는 403, 읽기는 200이다', async () => {
    const forbidden = await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: READ_TOKEN,
      key: 'k-403',
      body: { items: [bulkItem('security', '문1')] },
    });
    expect(forbidden.status).toBe(403);
    const ok = await adminRequest('/api/admin/audit', { token: READ_TOKEN });
    expect(ok.status).toBe(200);
  });
});

describe('bulk 등록·멱등·원자성', () => {
  it('유효 토큰 bulk 3건 → 201·저장 3·감사 3', async () => {
    const res = await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: WRITE_TOKEN,
      key: 'k-bulk-1',
      body: { items: [bulkItem('security', '문1'), bulkItem('resilience', '문2'), bulkItem('performance', '문3')] },
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ created: Array<{ questionId: string }> }>();
    expect(body.created).toHaveLength(3);
    expect(await tableCount('questions')).toBe(3);
    expect(await tableCount('audit_logs')).toBe(3);
  });

  it('동일 key+동일 payload → 최초 결과 재현, 중복 저장 0', async () => {
    const payload = { items: [bulkItem('security', '문1')] };
    const first = await adminRequest('/api/admin/questions/bulk', { method: 'POST', token: WRITE_TOKEN, key: 'k-idem', body: payload });
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    const second = await adminRequest('/api/admin/questions/bulk', { method: 'POST', token: WRITE_TOKEN, key: 'k-idem', body: payload });
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(firstBody);
    expect(await tableCount('questions')).toBe(1);
    expect(await tableCount('audit_logs')).toBe(1);
  });

  it('동일 key+다른 payload → 409', async () => {
    await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: WRITE_TOKEN,
      key: 'k-conflict',
      body: { items: [bulkItem('security', '문1')] },
    });
    const res = await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: WRITE_TOKEN,
      key: 'k-conflict',
      body: { items: [bulkItem('security', '문2-다른내용')] },
    });
    expect(res.status).toBe(409);
    expect(await tableCount('questions')).toBe(1);
  });

  it('1건 스키마 오류(Zod) → 전체 저장 0·422 항목 오류', async () => {
    const res = await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: WRITE_TOKEN,
      key: 'k-atomic',
      body: { items: [bulkItem('security', '문1'), { ...bulkItem('security', '문2'), stem: '' }] },
    });
    expect(res.status).toBe(422);
    const body = await res.json<{ error: string; issues: unknown[] }>();
    expect(body.error).toBe('validation_failed');
    expect(body.issues.length).toBeGreaterThan(0);
    expect(await tableCount('questions')).toBe(0);
    expect(await tableCount('audit_logs')).toBe(0);
  });

  it('1건 도메인 오류(유스케이스) → 전체 저장 0·422 bulk_failed', async () => {
    const res = await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: WRITE_TOKEN,
      key: 'k-atomic-2',
      body: { items: [bulkItem('security', '문1'), bulkItem('no-such-domain-x', '문2')] },
    });
    expect(res.status).toBe(422);
    const body = await res.json<{ error: string; failures: Array<{ index: number }> }>();
    expect(body.error).toBe('bulk_failed');
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].index).toBe(1);
    expect(await tableCount('questions')).toBe(0);
    expect(await tableCount('audit_logs')).toBe(0);
  });

  it('3000자 Markdown+Mermaid 해설도 201로 저장·조회된다', async () => {
    const explanation = [
      '## 해설',
      '',
      '- **핵심**: 프라이빗 서브넷에서 VPC 엔드포인트로 S3에 접근한다.',
      '',
      '| 항목 | 값 |',
      '| --- | --- |',
      '| 경로 | S3 Gateway Endpoint |',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[EC2] --> B[VPC Endpoint]',
      '  B --> C[S3]',
      '```',
      '',
      '가'.repeat(2900),
    ].join('\n');
    expect(explanation.length).toBeGreaterThan(3000);
    const res = await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: WRITE_TOKEN,
      key: 'k-markdown',
      body: { items: [{ ...bulkItem('security', '마크다운 문1'), explanation }] },
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ created: Array<{ questionId: string }> }>();
    const got = await adminRequest(`/api/admin/questions/${body.created[0]?.questionId}`, { token: WRITE_TOKEN });
    expect(got.status).toBe(200);
    const detail = await got.json<{ version: { explanation: string } }>();
    expect(detail.version.explanation).toBe(explanation);
  });

  it('Idempotency-Key 없으면 422', async () => {
    const res = await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: WRITE_TOKEN,
      body: { items: [bulkItem('security', '문1')] },
    });
    expect(res.status).toBe(422);
  });

  it('모르는 시험/영역 코드 → 422·저장 0', async () => {
    const res = await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: WRITE_TOKEN,
      key: 'k-unknown',
      body: { items: [bulkItem('no-such-domain-x', '문1')] },
    });
    expect(res.status).toBe(422);
    expect(await tableCount('questions')).toBe(0);
  });

  it('잘못된 answer 부분집합 → 422', async () => {
    const res = await adminRequest('/api/admin/questions', {
      method: 'POST',
      token: WRITE_TOKEN,
      body: bulkItem('security', '문1', ['Z']),
    });
    expect(res.status).toBe(422);
    expect(await tableCount('questions')).toBe(0);
  });
});

describe('단건·수정·비활성화·조회·감사', () => {
  async function createOne(): Promise<string> {
    const res = await adminRequest('/api/admin/questions', {
      method: 'POST',
      token: WRITE_TOKEN,
      body: bulkItem('security', '단건'),
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ questionId: string }>();
    return body.questionId;
  }

  it('PATCH는 새 개정을 만들고 GET에 반영된다', async () => {
    const id = await createOne();
    const patched = await adminRequest(`/api/admin/questions/${id}`, {
      method: 'PATCH',
      token: WRITE_TOKEN,
      body: { stem: '수정된 문제' },
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ versionNo: 2 });
    const got = await adminRequest(`/api/admin/questions/${id}`, { token: WRITE_TOKEN });
    expect(got.status).toBe(200);
    const detail = await got.json<{ question: { status: string }; version: { stem: string; versionNo: number }; options: unknown[] }>();
    expect(detail.version.stem).toBe('수정된 문제');
    expect(detail.options).toHaveLength(4);
  });

  it('모르는 문제는 PATCH·GET 모두 404다', async () => {
    expect((await adminRequest('/api/admin/questions/q-missing', { method: 'PATCH', token: WRITE_TOKEN, body: { stem: 'x' } })).status).toBe(404);
    expect((await adminRequest('/api/admin/questions/q-missing', { token: WRITE_TOKEN })).status).toBe(404);
    expect((await adminRequest('/api/admin/questions/q-missing/deactivate', { method: 'POST', token: WRITE_TOKEN })).status).toBe(404);
  });

  it('비활성화 후 row 보존·출제 제외·감사 기록', async () => {
    const id = await createOne();
    const res = await adminRequest(`/api/admin/questions/${id}/deactivate`, { method: 'POST', token: WRITE_TOKEN });
    expect(res.status).toBe(200);
    const got = await adminRequest(`/api/admin/questions/${id}`, { token: WRITE_TOKEN });
    expect((await got.json<{ question: { status: string } }>()).question.status).toBe('inactive');
    const repo = createD1QuestionBankRepository(db);
    expect(await repo.listActiveQuestions({ examId: 'exam-saa' })).toHaveLength(0);
    expect(await repo.findQuestion({ questionId: id })).not.toBeNull();
  });

  it('감사 목록은 페이지네이션된다', async () => {
    await createOne();
    await createOne();
    const first = await adminRequest('/api/admin/audit?limit=1&offset=0', { token: READ_TOKEN });
    expect(first.status).toBe(200);
    const page1 = await first.json<{ items: unknown[]; total: number; limit: number; offset: number }>();
    expect(page1.items).toHaveLength(1);
    expect(page1.total).toBe(2);
    expect(page1.limit).toBe(1);
    const second = await adminRequest('/api/admin/audit?limit=1&offset=1', { token: READ_TOKEN });
    expect((await second.json<{ items: unknown[] }>()).items).toHaveLength(1);
  });
});

describe('로그 redaction', () => {
  it('토큰·payload 원문이 로그에 남지 않고 화이트리스트 필드만 있다', async () => {
    const stem = `민감-문구-${crypto.randomUUID()}`;
    await adminRequest('/api/admin/questions/bulk', {
      method: 'POST',
      token: WRITE_TOKEN,
      key: 'k-redact',
      body: { items: [bulkItem('security', stem)] },
    });
    await adminRequest('/api/admin/questions/q-x', { token: 'unknown-bad-token-zzz' });
    expect(capturedLogs.length).toBeGreaterThan(0);
    for (const line of capturedLogs) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(entry).sort()).toEqual(['level', 'msg', 'outcome', 'requestId']);
      expect(line).not.toContain(WRITE_TOKEN);
      expect(line).not.toContain(stem);
      expect(line).not.toContain('unknown-bad-token-zzz');
    }
  });
});

describe('production createApp 조립', () => {
  it('admin 라우트가 등록되어 미인증 요청은 401', async () => {
    const productionApp = createApp();
    const res = await productionApp.fetch(
      new Request('https://moi.test/api/admin/questions/unknown'),
      env,
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
  });
});
