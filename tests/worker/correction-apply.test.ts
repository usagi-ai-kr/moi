import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRecord } from '@/app/stats/attempt-ports';
import { applyCorrection } from '@/app/reports/correction-service';
import type { StudySet, StudySetItem, StudySetResult } from '@/domain/study/types';
import { createD1CorrectionRepository } from '@/infra/persistence/study-correction-repository';
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

// 이슈 #53 정정 적용 유스케이스 — 이벤트 기록·시도 제외·재계산·거부 사유·원본 불변을 증명한다.
const db = env.DB;
const NOW = 1792320000;

function deps() {
  return {
    studyRepository: createD1StudySetRepository(db),
    correctionRepository: createD1CorrectionRepository(db),
    attempts: createD1StudyAttemptRepository(db),
  };
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

function perItem(questionId: string, correct: boolean) {
  return {
    questionId,
    responseKind: 'answered' as const,
    selectedOptionIds: [correct ? 'o-1' : 'o-2'],
    correctOptionIds: ['o-1'],
    correct,
  };
}

/** q-1·q-2 정답, q-3 오답 — 원본 정답률 67%(2/3). */
function submittedSet(id: string, userId = 'u-1'): StudySet {
  const result: StudySetResult = {
    answeredCount: 3,
    correctCount: 2,
    accuracyPercent: 67,
    passCount: 0,
    unansweredCount: 0,
    perItem: [perItem('q-1', true), perItem('q-2', true), perItem('q-3', false)],
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

async function seedBase(): Promise<void> {
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
    .prepare(
      "INSERT INTO study_sets (id, user_id, exam_id, mode, status, created_at, submitted_at, result_json) VALUES ('set-2', 'u-1', 'e-1', 'all', 'active', ?1, NULL, NULL)",
    )
    .bind(NOW)
    .run();
}

async function seedSubmittedSet(): Promise<void> {
  await createD1StudySetRepository(db).save({ set: submittedSet('set-1') });
  await createD1StudyAttemptRepository(db).recordBatch({
    attempts: [
      attempt({ attemptId: 'a-1', questionId: 'q-1', firstAttempt: true }),
      attempt({ attemptId: 'a-2', questionId: 'q-2' }),
      attempt({ attemptId: 'a-3', questionId: 'q-3', outcome: 'wrong' }),
    ],
  });
}

async function countCorrections(setId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM study_corrections WHERE set_id = ?1').bind(setId).first<{ c: number }>();
  return row?.c ?? -1;
}

async function excludedAt(attemptId: string): Promise<number | null> {
  const row = await db.prepare('SELECT excluded_at FROM study_attempts WHERE attempt_id = ?1').bind(attemptId).first<{ excluded_at: number | null }>();
  return row?.excluded_at ?? null;
}

const baseInput = {
  userId: 'u-1',
  setId: 'set-1',
  questionVersionId: 'q-3-v1',
  reason: 'answer-changed',
  source: 'recheck',
  now: NOW + 500,
};

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
  for (const t of ['study_attempts', 'study_corrections', 'study_set_items', 'study_sets', 'question_versions', 'questions']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  for (const t of ['users', 'exam_domains', 'exams']) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await seedBase();
});

describe('정정 적용 유스케이스 (#53)', () => {
  it('applied: 이벤트 1행·시도 제외·재계산된 corrected 반환', async () => {
    await seedSubmittedSet();
    const result = await applyCorrection(deps(), baseInput);
    expect(result.outcome).toBe('applied');
    expect(await countCorrections('set-1')).toBe(1);
    expect(await excludedAt('a-3')).toBe(baseInput.now);
    expect(await excludedAt('a-1')).toBeNull();
    expect(await excludedAt('a-2')).toBeNull();
    if (result.outcome === 'rejected') throw new Error('unreachable');
    expect(result.corrected.validTotal).toBe(2);
    expect(result.corrected.correctCount).toBe(2);
    expect(result.corrected.accuracyPercent).toBe(100);
    expect(result.corrected.excludedCount).toBe(1);
    expect(result.corrected.excludedQuestionVersionIds).toEqual(['q-3-v1']);
    expect(result.corrected.ungraded).toBe(false);
  });

  it('duplicate: 이벤트 1행 유지·시도 그대로·corrected 동일', async () => {
    await seedSubmittedSet();
    const first = await applyCorrection(deps(), baseInput);
    const second = await applyCorrection(deps(), baseInput);
    expect(second.outcome).toBe('duplicate');
    expect(await countCorrections('set-1')).toBe(1);
    expect(await excludedAt('a-3')).toBe(baseInput.now);
    expect(await excludedAt('a-1')).toBeNull();
    expect(await excludedAt('a-2')).toBeNull();
    if (first.outcome === 'rejected' || second.outcome === 'rejected') throw new Error('unreachable');
    expect(second.corrected).toEqual(first.corrected);
  });

  it('다른 user는 rejected — 이벤트·시도 변경 없음', async () => {
    await seedSubmittedSet();
    const result = await applyCorrection(deps(), { ...baseInput, userId: 'u-2' });
    expect(result).toEqual({ outcome: 'rejected', reason: 'owner_mismatch' });
    expect(await countCorrections('set-1')).toBe(0);
    expect(await excludedAt('a-3')).toBeNull();
  });

  it('없는 세트는 rejected(set_not_found)', async () => {
    await seedSubmittedSet();
    const result = await applyCorrection(deps(), { ...baseInput, setId: 'missing-set' });
    expect(result).toEqual({ outcome: 'rejected', reason: 'set_not_found' });
    expect(await countCorrections('set-1')).toBe(0);
  });

  it('미제출 세트는 rejected(not_submitted)', async () => {
    await seedSubmittedSet();
    const result = await applyCorrection(deps(), { ...baseInput, setId: 'set-2' });
    expect(result).toEqual({ outcome: 'rejected', reason: 'not_submitted' });
    expect(await countCorrections('set-2')).toBe(0);
    expect(await excludedAt('a-3')).toBeNull();
  });

  it('세트에 없는 개정은 rejected(version_not_in_set)', async () => {
    await seedSubmittedSet();
    const result = await applyCorrection(deps(), { ...baseInput, questionVersionId: 'q-1-v2' });
    expect(result).toEqual({ outcome: 'rejected', reason: 'version_not_in_set' });
    expect(await countCorrections('set-1')).toBe(0);
    expect(await excludedAt('a-1')).toBeNull();
    expect(await excludedAt('a-3')).toBeNull();
  });

  it('적용 후에도 원본 set.result는 불변이다', async () => {
    await seedSubmittedSet();
    await applyCorrection(deps(), baseInput);
    const set = await createD1StudySetRepository(db).findById({ id: 'set-1' });
    expect(set?.result?.accuracyPercent).toBe(67);
    expect(set?.result?.correctCount).toBe(2);
    expect(set?.result?.answeredCount).toBe(3);
    expect(set?.status).toBe('submitted');
  });
});
