import {
  MAX_WEAK_RECOMMENDATIONS,
  MIN_DOMAIN_SAMPLE,
  RECENT_BLEND_WEIGHT,
  RECENT_WINDOW_MS,
  REPEAT_GRADED_ATTEMPTS_CAP,
  WEAK_ACCURACY_THRESHOLD,
} from './thresholds';
import type {
  ComputeStatsOptions,
  DomainStats,
  StudyHistoryEntry,
  StudyStats,
  WeakDomainRecommendation,
} from './types';

/**
 * 학습 현황 순수 계산 (이슈 #54, ADR-0021 "결정 — 학습 현황").
 * - 외부 패키지·DB·네트워크 의존 금지, 같은 입력 같은 결과(결정성).
 * - 시험별 분리: options.examId와 일치하지 않는 이력은 집계 전에 제외한다.
 * - 누적 정답률(DomainStats.cumulativeAccuracy·전체)은 모든 유효 시도 기준
 *   (정답 수 / 유효 채점 시도 수, attemptId 중복 제거·미래 제외·pass/unanswered 제외).
 * - 반복 영향 제한: 취약 추천·최근 성과는 문제당 최근 채점 시도
 *   REPEAT_GRADED_ATTEMPTS_CAP건만 반영 + 문제당 동일 가중 평균
 *   (시도 수가 많은 문제의 지배 방지).
 * - 비채점(pass/unanswered)은 정답률 분모에 넣지 않고 첫 풀이로도 세지 않는다.
 */

const isGraded = (e: StudyHistoryEntry): boolean => e.outcome === 'correct' || e.outcome === 'wrong';

/** 동일 attemptId 중복 기록 제거(입력 순서 유지 — 결정성). */
function dedupeAttempts(entries: readonly StudyHistoryEntry[]): readonly StudyHistoryEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (e.attemptId === undefined) return true;
    if (seen.has(e.attemptId)) return false;
    seen.add(e.attemptId);
    return true;
  });
}

/** 첫 시도 판정: firstAttempt=true 항목 우선, 없으면 occurredAt 최솟값(동률은 입력 순서). */
function firstAttemptOf(entries: readonly StudyHistoryEntry[]): StudyHistoryEntry | undefined {
  const explicit = entries.find((e) => e.firstAttempt === true);
  if (explicit) return explicit;
  let earliest: StudyHistoryEntry | undefined;
  for (const e of entries) {
    if (!earliest || e.occurredAt < earliest.occurredAt) earliest = e;
  }
  return earliest;
}

/** 문제당 반영 시도: 채점 가능 기록 중 가장 최근 REPEAT_GRADED_ATTEMPTS_CAP건(현재 숙달도 대표). */
function cappedGradedAttempts(entries: readonly StudyHistoryEntry[], now: number): readonly StudyHistoryEntry[] {
  return entries
    .filter(isGraded)
    .filter((e) => e.occurredAt <= now)
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, REPEAT_GRADED_ATTEMPTS_CAP);
}

function meanOr(values: readonly number[], fallback: number | null): number | null {
  if (values.length === 0) return fallback;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

interface QuestionRollup {
  readonly cumulative: number | null;
  readonly recent: number | null;
  readonly firstGraded: boolean;
  /** 반영된 채점 시도 수(반복 상한 적용 후 — 취약 추천·최근 성과용). */
  readonly gradedAttempts: number;
}

/** 모든 유효 시도 기준 누적(반복 상한 없음): 분자 정답 수 / 분모 유효 채점 시도 수. */
function allAttemptsStats(
  entries: readonly StudyHistoryEntry[],
  now: number,
): { accuracy: number | null; gradedAttempts: number } {
  const valid = dedupeAttempts(entries).filter((e) => isGraded(e) && e.occurredAt <= now);
  if (valid.length === 0) return { accuracy: null, gradedAttempts: 0 };
  const correct = valid.filter((e) => e.outcome === 'correct').length;
  return { accuracy: correct / valid.length, gradedAttempts: valid.length };
}

function rollupPerQuestion(entries: readonly StudyHistoryEntry[], now: number): readonly QuestionRollup[] {
  const byQuestion = new Map<string, StudyHistoryEntry[]>();
  for (const e of dedupeAttempts(entries)) {
    const list = byQuestion.get(e.questionId);
    if (list) list.push(e);
    else byQuestion.set(e.questionId, [e]);
  }
  const cutoff = now - RECENT_WINDOW_MS;
  const rollups: QuestionRollup[] = [];
  for (const list of byQuestion.values()) {
    const attempts = cappedGradedAttempts(list, now);
    const acc = meanOr(attempts.map((e) => (e.outcome === 'correct' ? 1 : 0)), null);
    const recentAttempts = attempts.filter((e) => e.occurredAt >= cutoff);
    const recent = meanOr(recentAttempts.map((e) => (e.outcome === 'correct' ? 1 : 0)), null);
    const first = firstAttemptOf(list);
    rollups.push({ cumulative: acc, recent, firstGraded: first !== undefined && isGraded(first), gradedAttempts: attempts.length });
  }
  return rollups;
}

/** 영역별/전체 공통 집계(반복 제한 — 취약 추천·최근 성과용): 첫 풀이 수, 상한 적용 시도 수, 문제당 평균 누적·최근. */
function aggregate(rollups: readonly QuestionRollup[]): {
  uniqueFirstSolved: number;
  gradedAttempts: number;
  cumulative: number | null;
  recent: number | null;
} {
  const accuracies = rollups.map((r) => r.cumulative).filter((v): v is number => v !== null);
  const recentValues = rollups.map((r) => r.recent).filter((v): v is number => v !== null);
  return {
    uniqueFirstSolved: rollups.filter((r) => r.firstGraded).length,
    gradedAttempts: rollups.reduce((s, r) => s + r.gradedAttempts, 0),
    cumulative: meanOr(accuracies, null),
    recent: meanOr(recentValues, null),
  };
}

/** 시험별 학습 현황 계산 — 입력 이력에서 해당 시험만 집계한다. */
export function computeStudyStats(
  entries: readonly StudyHistoryEntry[],
  options: ComputeStatsOptions,
): StudyStats {
  const examEntries = entries.filter((e) => e.examId === options.examId);
  const byDomain = new Map<string, StudyHistoryEntry[]>();
  for (const e of examEntries) {
    const list = byDomain.get(e.domainId);
    if (list) list.push(e);
    else byDomain.set(e.domainId, [e]);
  }

  const domainStats: DomainStats[] = [];
  const recommendable: { domainId: string; score: number; cumulative: number; effectiveRecent: number; sample: number }[] = [];
  let allRollups: QuestionRollup[] = [];

  for (const [domainId, list] of byDomain) {
    const rollups = rollupPerQuestion(list, options.now);
    allRollups = allRollups.concat(rollups);
    const agg = aggregate(rollups);
    const all = allAttemptsStats(list, options.now);
    const sufficient = agg.uniqueFirstSolved >= MIN_DOMAIN_SAMPLE && all.accuracy !== null;
    domainStats.push({
      domainId,
      uniqueFirstSolved: agg.uniqueFirstSolved,
      gradedAttempts: all.gradedAttempts,
      cumulativeAccuracy: all.accuracy,
      recentAccuracy: agg.recent,
      status: sufficient ? 'ok' : 'insufficient-data',
    });
    if (sufficient && agg.cumulative !== null) {
      const effectiveRecent = agg.recent ?? agg.cumulative;
      recommendable.push({
        domainId,
        score: agg.cumulative * (1 - RECENT_BLEND_WEIGHT) + effectiveRecent * RECENT_BLEND_WEIGHT,
        cumulative: agg.cumulative,
        effectiveRecent,
        sample: agg.uniqueFirstSolved,
      });
    }
  }

  const overall = aggregate(allRollups);
  const overallAll = allAttemptsStats(examEntries, options.now);
  const weakDomains: WeakDomainRecommendation[] = recommendable
    .filter((r) => r.score < WEAK_ACCURACY_THRESHOLD)
    .sort((a, b) => a.score - b.score || a.domainId.localeCompare(b.domainId))
    .slice(0, MAX_WEAK_RECOMMENDATIONS)
    .map((r) => ({
      domainId: r.domainId,
      score: r.score,
      cumulativeAccuracy: r.cumulative,
      effectiveRecentAccuracy: r.effectiveRecent,
      uniqueFirstSolved: r.sample,
    }));

  domainStats.sort((a, b) => a.domainId.localeCompare(b.domainId));

  return {
    examId: options.examId,
    totalQuestions: options.totalQuestions,
    domainQuestionCounts: options.domainQuestionCounts ?? {},
    uniqueFirstSolved: overall.uniqueFirstSolved,
    coverage: options.totalQuestions > 0
      ? Math.min(overall.uniqueFirstSolved / options.totalQuestions, 1)
      : 0,
    overallAccuracy: overallAll.accuracy,
    domains: domainStats,
    weakDomains,
  };
}
