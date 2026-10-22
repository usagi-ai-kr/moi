import type { StudyStats } from '../api/client';
import type { StudyScope } from './types';

export interface ScopeProgress {
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
  readonly label: 'learning' | 'exam';
}

function isPositiveCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Selects the matching numerator and denominator without inventing a pool size. */
export function getScopeProgress(
  stats: StudyStats,
  scope: StudyScope,
  domainId: string,
): ScopeProgress | null {
  const domainCount = scope === 'domain' ? stats.domainQuestionCounts?.[domainId] : undefined;
  const total = scope === 'domain' ? domainCount : stats.totalQuestions;
  if (!isPositiveCount(total)) return null;

  const domain = scope === 'domain' ? stats.domains.find((item) => item.domainId === domainId) : undefined;
  const completed = Math.min(
    validCount(scope === 'domain' ? domain?.uniqueFirstSolved : stats.uniqueFirstSolved),
    total,
  );

  return {
    completed,
    total,
    percent: Math.round((completed / total) * 1000) / 10,
    label: scope === 'weak' ? 'exam' : 'learning',
  };
}
