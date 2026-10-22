import { runQualityGate } from '@/domain/question-quality/quality-gate';
import type { QuestionDraft, QualityReport } from '@/domain/question-quality/types';
import type { QuestionGenerator } from './ports';

/**
 * QualityGate orchestration (이슈 #48): 초안 생성(Port) → 결정적 품질 검사(domain).
 * AI provider는 fake만 사용하며 DB·HTTP는 이 단위 범위 밖이다(#47/#55).
 */

export interface QualityGateServiceDeps {
  readonly generator: QuestionGenerator;
}

export interface GenerateAndCheckResult {
  readonly drafts: readonly QuestionDraft[];
  readonly report: QualityReport;
}

export async function generateAndCheck(
  deps: QualityGateServiceDeps,
  input: { count: number },
): Promise<GenerateAndCheckResult> {
  const drafts = await deps.generator.generateDrafts({ count: input.count });
  return { drafts, report: runQualityGate(drafts) };
}
