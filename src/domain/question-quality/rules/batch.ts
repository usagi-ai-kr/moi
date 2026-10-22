import type { BatchFinding, QuestionDraft, SaaDomain } from '../types';
import { normalizeText } from '../normalize';
import {
  ANSWER_POSITION_MAX_SHARE,
  ANSWER_POSITION_MIN_SAMPLE,
  DOMAIN_DISTRIBUTION_TOLERANCE,
  DOMAIN_TARGETS,
  FULL_BATCH_SIZE,
} from '../thresholds';

/**
 * 규칙 5·8·9 — 배치 단위 검사 (이슈 #48, ADR-0019).
 * 규칙 5: 정답 위치 편향(단일 정답 문제의 option index 분포).
 * 규칙 8: SAA 영역 분포(150/130/120/100) — 500 전량 배치는 정확 일치, 부분 배치는 ±10%p.
 * 규칙 9: 배치 내 중복(동일 stem·유사 option set).
 */

export function checkAnswerPositionBias(drafts: readonly QuestionDraft[]): BatchFinding | null {
  const samples: Array<{ questionId: string; index: number }> = [];
  for (const draft of drafts) {
    if (draft.answerOptionIds.length !== 1) continue; // 복수 정답은 위치 기준에서 제외
    const answerId = draft.answerOptionIds[0];
    const index = draft.options.findIndex((option) => option.id === answerId);
    if (index >= 0) samples.push({ questionId: draft.id, index });
  }
  if (samples.length < ANSWER_POSITION_MIN_SAMPLE) {
    return null; // 표본 부족 — 판정 보류(편향 통계 불안정)
  }
  const maxIndex = Math.max(...samples.map((sample) => sample.index));
  const buckets = new Array<number>(maxIndex + 1).fill(0);
  for (const sample of samples) buckets[sample.index] += 1;
  for (let index = 0; index < buckets.length; index += 1) {
    const share = buckets[index] / samples.length;
    if (share > ANSWER_POSITION_MAX_SHARE) {
      return {
        checkId: 'answer-position-bias',
        reason: `answer-position-bias: 정답이 ${index}번 위치에 편중되어 있다(비중 ${(share * 100).toFixed(1)}%)`,
        questionIds: samples.filter((sample) => sample.index === index).map((sample) => sample.questionId),
      };
    }
  }
  return null;
}

export function checkDomainDistribution(drafts: readonly QuestionDraft[]): BatchFinding | null {
  const counts = new Map<SaaDomain, number>();
  for (const domain of Object.keys(DOMAIN_TARGETS) as SaaDomain[]) counts.set(domain, 0);
  for (const draft of drafts) counts.set(draft.domain, (counts.get(draft.domain) ?? 0) + 1);

  if (drafts.length === FULL_BATCH_SIZE) {
    for (const [domain, target] of Object.entries(DOMAIN_TARGETS)) {
      const actual = counts.get(domain as SaaDomain) ?? 0;
      if (actual !== target) {
        return {
          checkId: 'domain-distribution',
          reason: `domain-distribution: ${domain} 영역 수가 목표(${target})와 다르다(실제 ${actual})`,
          questionIds: drafts.filter((draft) => draft.domain === domain).map((draft) => draft.id),
        };
      }
    }
    return null;
  }

  for (const [domain, target] of Object.entries(DOMAIN_TARGETS)) {
    const expected = (drafts.length * target) / FULL_BATCH_SIZE;
    const actual = counts.get(domain as SaaDomain) ?? 0;
    const tolerance = Math.max(1, drafts.length * DOMAIN_DISTRIBUTION_TOLERANCE);
    if (Math.abs(actual - expected) > tolerance) {
      return {
        checkId: 'domain-distribution',
        reason: `domain-distribution: ${domain} 영역 비중이 목표와 벗어난다(기대 ${expected.toFixed(1)}·실제 ${actual})`,
        questionIds: drafts.filter((draft) => draft.domain === domain).map((draft) => draft.id),
      };
    }
  }
  return null;
}

export function checkBatchDuplication(drafts: readonly QuestionDraft[]): BatchFinding[] {
  const findings: BatchFinding[] = [];

  const byStem = new Map<string, string[]>();
  for (const draft of drafts) {
    const key = normalizeText(draft.stem);
    const bucket = byStem.get(key) ?? [];
    bucket.push(draft.id);
    byStem.set(key, bucket);
  }
  for (const ids of byStem.values()) {
    if (ids.length > 1) {
      findings.push({
        checkId: 'batch-duplication',
        reason: 'batch-duplication: 배치 내 동일 stem이 있다',
        questionIds: ids,
      });
      break; // 첫 그룹만 보고(결정적)
    }
  }

  const byOptionSet = new Map<string, string[]>();
  for (const draft of drafts) {
    const key = draft.options.map((option) => normalizeText(option.text)).sort().join('|');
    const bucket = byOptionSet.get(key) ?? [];
    bucket.push(draft.id);
    byOptionSet.set(key, bucket);
  }
  for (const ids of byOptionSet.values()) {
    if (ids.length > 1) {
      findings.push({
        checkId: 'batch-duplication',
        reason: 'batch-duplication: 배치 내 동일 option set이 있다',
        questionIds: ids,
      });
      break;
    }
  }

  return findings;
}
