import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerQuestionVersion } from '@/app/question/register-question-version';
import { assertWeightsSumToHundred } from '@/domain/question/question';
import { createD1QuestionBankRepository } from '@/infra/persistence/d1-question-bank-repository';
import migration0000 from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import migration0001 from '../../drizzle/migrations/0001_add-users-external-identities.sql?raw';
import migration0002 from '../../drizzle/migrations/0002_add-sessions.sql?raw';
import migration0003 from '../../drizzle/migrations/0003_add-question-bank.sql?raw';
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #46 (ADR-0019) Worker+D1 통합 테스트 — 실제 마이그레이션·FK/UNIQUE·
// SAA-C03 시드·버전 생성·부분집합 검증·비활성화·mapper를 증명한다. 동시성은 범위 밖(후속).

const db = env.DB;
const repo = createD1QuestionBankRepository(db);

const NOW = 1792310000;
const EXAM_ID = 'exam-saa-c03';
const DOMAINS = [
  { id: 'dom-security', code: 'security', name: '보안', weight: 30 },
  { id: 'dom-resilience', code: 'resilience', name: '복원력', weight: 26 },
  { id: 'dom-performance', code: 'performance', name: '성능', weight: 24 },
  { id: 'dom-cost-optimization', code: 'cost-optimization', name: '비용 최적화', weight: 20 },
];

async function seedExam(): Promise<void> {
  await repo.insertExam({ id: EXAM_ID, code: 'saa-c03', name: 'AWS SAA-C03', now: NOW });
  for (const d of DOMAINS) {
    await repo.insertDomain({ id: d.id, examId: EXAM_ID, code: d.code, name: d.name, weight: d.weight });
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001, migration0002, migration0003]);
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 테스트가 실제 강제 여부를 드러낸다.
  }
});

beforeEach(async () => {
  for (const t of ['question_options', 'question_versions', 'questions', 'audit_logs', 'exam_domains', 'exams']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
});

describe('스키마 계약 (0003_add-question-bank)', () => {
  it('테이블·UNIQUE·INDEX가 마이그레이션으로 만들어진다', async () => {
    const indexes = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL")
      .all<{ name: string }>();
    const names = indexes.results.map((r) => r.name).join(',');
    for (const expected of [
      'exams_code_unique',
      'exam_domains_exam_code_uq',
      'questions_exam_status_idx',
      'question_versions_question_version_uq',
      'question_options_version_key_uq',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('FK: 존재하지 않는 시험을 참조하는 영역은 거부한다', async () => {
    const insert = db
      .prepare("INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES ('d', 'missing-exam', 'x', 'X', 10)")
      .run();
    await expect(insert).rejects.toThrow();
  });

  it('UNIQUE: 같은 시험에 영역 코드 중복을 거부한다', async () => {
    await seedExam();
    const dup = repo.insertDomain({ id: 'dom-dup', examId: EXAM_ID, code: 'security', name: '중복', weight: 0 });
    await expect(dup).rejects.toThrow();
  });
});

describe('SAA-C03 시드·가중치', () => {
  it('시험 1건 + 4개 영역, 가중치 합 100이 저장된다', async () => {
    await seedExam();
    const exam = await repo.findExam({ examId: EXAM_ID });
    expect(exam).toMatchObject({ code: 'saa-c03' });
    const domains = await repo.listDomains({ examId: EXAM_ID });
    expect(domains).toHaveLength(4);
    expect(() => assertWeightsSumToHundred(domains.map((d) => d.weight))).not.toThrow();
  });
});

describe('문제 버전 생성·검증·비활성화', () => {
  const versionInput = {
    id: 'qv-1',
    questionId: 'q-1',
    stem: 'SAA-C03 예시 문제',
    explanation: '핵심 해설 한 줄.',
    sourceUrls: ['https://docs.aws.amazon.com/x'],
    answerOptionIds: ['qo-1', 'qo-3'],
    optionSetHash: 'hash-1',
    options: [
      { id: 'qo-1', optionKey: 'A', text: '보기 1' },
      { id: 'qo-2', optionKey: 'B', text: '보기 2' },
      { id: 'qo-3', optionKey: 'C', text: '보기 3' },
      { id: 'qo-4', optionKey: 'D', text: '보기 4' },
    ],
    now: NOW,
  };

  it('v1 생성 → 최신 조회·보기 조회·current_version_no 갱신', async () => {
    await seedExam();
    await repo.insertQuestion({ id: 'q-1', examId: EXAM_ID, domainId: 'dom-security', now: NOW });
    const created = await registerQuestionVersion(repo, versionInput);
    expect(created).toMatchObject({ id: 'qv-1', versionNo: 1 });
    const latest = await repo.findVersion({ questionId: 'q-1' });
    expect(latest).toMatchObject({ versionNo: 1, reviewStatus: 'pending' });
    expect(latest?.answerOptionIds).toEqual(['qo-1', 'qo-3']);
    const options = await repo.findOptionsByVersion({ questionVersionId: 'qv-1' });
    expect(options).toHaveLength(4);
    const question = await repo.findQuestion({ questionId: 'q-1' });
    expect(question?.currentVersionNo).toBe(1);
  });

  it('정답이 보기에 없으면 저장 전 거부하고 버전이 늘지 않는다', async () => {
    await seedExam();
    await repo.insertQuestion({ id: 'q-1', examId: EXAM_ID, domainId: 'dom-security', now: NOW });
    await expect(
      registerQuestionVersion(repo, { ...versionInput, answerOptionIds: ['qo-9'] }),
    ).rejects.toThrow('subset');
    expect(await repo.findVersion({ questionId: 'q-1' })).toBeNull();
  });

  it('v2는 번호가 증가하고 최신 조회가 갱신된다', async () => {
    await seedExam();
    await repo.insertQuestion({ id: 'q-1', examId: EXAM_ID, domainId: 'dom-security', now: NOW });
    await registerQuestionVersion(repo, versionInput);
    const v2 = await registerQuestionVersion(repo, {
      ...versionInput,
      id: 'qv-2',
      stem: '수정된 문제',
      answerOptionIds: ['qo-5', 'qo-7'],
      options: [
        { id: 'qo-5', optionKey: 'A', text: '보기 1' },
        { id: 'qo-6', optionKey: 'B', text: '보기 2' },
        { id: 'qo-7', optionKey: 'C', text: '보기 3' },
        { id: 'qo-8', optionKey: 'D', text: '보기 4' },
      ],
      now: NOW + 1,
    });
    expect(v2.versionNo).toBe(2);
    expect((await repo.findVersion({ questionId: 'q-1' }))?.id).toBe('qv-2');
    expect((await repo.findVersion({ questionId: 'q-1', versionNo: 1 }))?.id).toBe('qv-1');
  });

  it('비활성화 후 row는 보존되고 출제 목록에서 제외된다', async () => {
    await seedExam();
    await repo.insertQuestion({ id: 'q-1', examId: EXAM_ID, domainId: 'dom-security', now: NOW });
    await registerQuestionVersion(repo, versionInput);
    await repo.deactivateQuestion({ questionId: 'q-1', now: NOW + 2 });
    const question = await repo.findQuestion({ questionId: 'q-1' });
    expect(question?.status).toBe('inactive');
    expect(await repo.listActiveQuestions({ examId: EXAM_ID })).toHaveLength(0);
    // 재 비활성화는 멱등(오류 없음)
    await repo.deactivateQuestion({ questionId: 'q-1', now: NOW + 3 });
  });
});

describe('감사 로그 골격', () => {
  it('append 후 행이 남고 토큰 원문을 강제하지 않는다', async () => {
    await repo.appendAuditLog({
      id: 'a-1',
      actor: 'admin:test',
      action: 'version.create',
      targetType: 'question_version',
      targetId: 'qv-1',
      requestId: 'req-1',
      now: NOW,
    });
    const row = await db.prepare('SELECT COUNT(*) AS c FROM audit_logs').first<{ c: number }>();
    expect(row?.c).toBe(1);
  });
});
