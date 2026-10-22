import type { StudySet } from '@/domain/study/types';
import type { AttemptRecord } from './attempt-ports';

/**
 * 제출 세트 → study_attempts 변환 (이슈 #54).
 * - 순수 함수: DB 조회·저장 없음(다음 단위).
 * - 불변식 위반(미제출/result 없음/perItem 누락)은 throw.
 */
export interface BuildSetAttemptsInput {
  readonly set: StudySet;
  readonly priorGradedQuestionIds: ReadonlySet<string> | readonly string[];
  readonly now?: number;
  readonly idFactory?: (input: { readonly setId: string; readonly questionId: string; readonly index: number }) => string;
}

function hasPrior(prior: ReadonlySet<string> | readonly string[], questionId: string): boolean {
  return prior instanceof Set ? prior.has(questionId) : (prior as readonly string[]).includes(questionId);
}

export function buildSetAttempts(input: BuildSetAttemptsInput): AttemptRecord[] {
  const { set } = input;
  if (set.status !== 'submitted') throw new Error(`submitted 세트만 변환한다: ${set.status}`);
  if (set.result === undefined) throw new Error('result 없는 세트는 변환하지 않는다');
  const occurredAt = set.submittedAt ?? input.now ?? Date.now();
  const byQuestionId = new Map(set.result.perItem.map((p) => [p.questionId, p]));

  return set.items.map((item, index) => {
    const perItem = byQuestionId.get(item.questionId);
    if (perItem === undefined) throw new Error(`perItem 누락: ${item.questionId}`);
    const outcome =
      perItem.responseKind === 'pass'
        ? 'pass'
        : perItem.responseKind === 'unanswered'
          ? 'unanswered'
          : perItem.correct
            ? 'correct'
            : 'wrong';
    const graded = outcome === 'correct' || outcome === 'wrong';
    return {
      attemptId:
        input.idFactory?.({ setId: set.id, questionId: item.questionId, index }) ?? `${set.id}:${item.questionId}`,
      userId: set.userId,
      examId: set.examId,
      questionId: item.questionId,
      questionVersionId: item.questionVersionId,
      outcome,
      occurredAt,
      source: 'set',
      sourceId: set.id,
      excludedAt: null,
      firstAttempt: graded && !hasPrior(input.priorGradedQuestionIds, item.questionId),
    };
  });
}
