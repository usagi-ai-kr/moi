import type { BatchFinding, QuestionDraft, QuestionFinding, QuestionQualityResult, QualityReport, SaaDomain } from './types';
import { checkAnswerConsistency, checkRequiredFields } from './rules/structure';
import { checkExplanationFormat, checkOptionBias, checkOptionDuplication, checkSourceUrls } from './rules/text';
import { checkAnswerPositionBias, checkBatchDuplication, checkDomainDistribution } from './rules/batch';

/**
 * 품질 검사 진입점 (이슈 #48, ADR-0019 자동 검수).
 * 결정적 순수 함수: 같은 입력 → 같은 리포트. 외부 패키지·DB·네트워크·시간 의존 없음.
 *
 * 문제 단위 규칙(순서 고정):
 *   1 required-fields → 2 answer-consistency → 3 duplication → 4 option-bias →
 *   6 explanation-format → 7 source-url
 * 배치 단위 규칙: 5 answer-position-bias → 8 domain-distribution → 9 batch-duplication.
 */

export function runQualityGate(drafts: readonly QuestionDraft[]): QualityReport {
  const results: QuestionQualityResult[] = drafts.map((draft) => {
    const findings: QuestionFinding[] = [
      ...checkRequiredFields(draft),
      ...checkAnswerConsistency(draft),
      ...checkOptionDuplication(draft),
      ...checkOptionBias(draft),
      ...checkExplanationFormat(draft),
      ...checkSourceUrls(draft),
    ];
    return { questionId: draft.id, pass: findings.length === 0, findings };
  });

  const batchFindings: BatchFinding[] = [];
  if (drafts.length === 0) {
    // 빈 배치는 출시 불가 — 실패 보고(결정적 문구).
    batchFindings.push({ checkId: 'empty-batch', reason: 'empty-batch: 배치가 비어 있다', questionIds: [] });
  }
  const positionBias = checkAnswerPositionBias(drafts);
  if (positionBias !== null) batchFindings.push(positionBias);
  const domainDistribution = checkDomainDistribution(drafts);
  if (domainDistribution !== null) batchFindings.push(domainDistribution);
  batchFindings.push(...checkBatchDuplication(drafts));

  const propagated = propagateQuestionLevelBatchFindings(results, batchFindings);
  const passedCount = propagated.filter((result) => result.pass).length;
  const failedCount = propagated.length - passedCount;
  const domainCounts: Readonly<Record<SaaDomain, number>> = countByDomain(drafts);

  return {
    results: propagated,
    batchFindings,
    passedCount,
    failedCount,
    pass: propagated.length > 0 && failedCount === 0 && batchFindings.length === 0,
    domainCounts,
  };
}

/** 배치 중복은 개별 문제의 결함이므로 관련 문제의 findings에도 기록해 재생성 대상이 되게 한다.
 * 위치 편향·영역 분포는 배치 구성 자체의 문제로 배치 수준에서만 보고한다. */
function propagateQuestionLevelBatchFindings(
  results: readonly QuestionQualityResult[],
  batchFindings: readonly BatchFinding[],
): QuestionQualityResult[] {
  const duplication = batchFindings.filter((finding) => finding.checkId === 'batch-duplication');
  if (duplication.length === 0) return [...results];
  const byId = new Map<string, QuestionFinding[]>();
  for (const finding of duplication) {
    for (const questionId of finding.questionIds) {
      const bucket = byId.get(questionId) ?? [];
      bucket.push({ questionId, checkId: 'batch-duplication', reason: finding.reason });
      byId.set(questionId, bucket);
    }
  }
  return results.map((result) => {
    const extra = byId.get(result.questionId);
    if (extra === undefined) return result;
    return { ...result, pass: false, findings: [...result.findings, ...extra] };
  });
}

function countByDomain(drafts: readonly QuestionDraft[]): Readonly<Record<SaaDomain, number>> {
  const counts: Record<SaaDomain, number> = { security: 0, resilience: 0, performance: 0, 'cost-optimization': 0 };
  for (const draft of drafts) counts[draft.domain] += 1;
  return counts;
}
