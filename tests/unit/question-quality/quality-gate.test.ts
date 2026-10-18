import { describe, expect, it } from 'vitest';
import type { QuestionDraft } from '@/domain/question-quality/types';
import { runQualityGate } from '@/domain/question-quality/quality-gate';
import { domainFor, makeDraft, makeOptions, rotateAnswerIndex } from './fixtures';

// 이슈 #48 — runQualityGate 통합: 문제별 pass/fail+사유·배치 요약·결정성(같은 입력 같은 결과).

function normalBatch(): QuestionDraft[] {
  const drafts = Array.from({ length: 500 }, (_, i) =>
    makeDraft({
      id: `q-full-${i}`,
      stem: `서로 다른 문제 ${i}번: 다중 AZ에서 가용성을 높이는 방법은? (변형 ${i})`,
      domain: domainFor(i, 500),
    }),
  );
  return rotateAnswerIndex(drafts);
}

describe('runQualityGate', () => {
  it('정상 500문제 배치: 전체 통과·요약 카운트 일치·영역 분포 기록', () => {
    const report = runQualityGate(normalBatch());

    expect(report.pass).toBe(true);
    expect(report.passedCount).toBe(500);
    expect(report.failedCount).toBe(0);
    expect(report.results).toHaveLength(500);
    expect(report.domainCounts).toEqual({ security: 150, resilience: 130, performance: 120, 'cost-optimization': 100 });
    expect(report.batchFindings).toEqual([]);
  });

  it('결함 문제: 해당 문제만 fail·나머지 pass', () => {
    const drafts = normalBatch();
    drafts[42] = { ...drafts[42], explanation: '' }; // 필수 필드 위반

    const report = runQualityGate(drafts);

    expect(report.pass).toBe(false);
    expect(report.passedCount).toBe(499);
    expect(report.failedCount).toBe(1);
    const failed = report.results.find((r) => r.questionId === 'q-full-42');
    expect(failed?.pass).toBe(false);
    expect(failed?.findings[0]?.checkId).toBe('required-fields');
  });

  it('배치 결함(영역 분포 오류): 개별 문제는 통과해도 배치 실패', () => {
    const drafts = normalBatch();
    const swapped = drafts.map((d, i) => (i === 0 ? { ...d, domain: 'cost-optimization' as const } : d));

    const report = runQualityGate(swapped);

    expect(report.pass).toBe(false);
    expect(report.failedCount).toBe(0); // 개별 문제 위반 없음
    expect(report.batchFindings.some((f) => f.checkId === 'domain-distribution')).toBe(true);
  });

  it('배치 중복(동일 stem): 두 문제 모두 fail', () => {
    const drafts = normalBatch();
    drafts[7] = { ...drafts[7], stem: '중복 문제 본문이다.' };
    drafts[8] = { ...drafts[8], stem: '중복 문제 본문이다.' };

    const report = runQualityGate(drafts);

    expect(report.pass).toBe(false);
    expect(report.failedCount).toBe(2);
    const dup = report.batchFindings.find((f) => f.checkId === 'batch-duplication');
    expect(dup?.questionIds).toEqual(['q-full-7', 'q-full-8']);
  });

  it('결정성: 같은 입력은 같은 결과(2회 실행 deep equal)', () => {
    const drafts = normalBatch();
    drafts[100] = { ...drafts[100], options: makeOptions(['중복 보기', '중복 보기', '보기 3', '보기 4']) };
    drafts[200] = { ...drafts[200], sourceUrls: ['깨진 url'] };

    const first = runQualityGate(drafts);
    const second = runQualityGate(drafts);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('빈 배치: 실패 보고(빈 문제은행은 출시 불가)', () => {
    const report = runQualityGate([]);

    expect(report.pass).toBe(false);
    expect(report.batchFindings).toHaveLength(1);
    expect(report.batchFindings[0]).toMatchObject({
      checkId: 'empty-batch',
      reason: 'empty-batch: 배치가 비어 있다',
      questionIds: [],
    });
    expect(report.results).toEqual([]);
  });
});
