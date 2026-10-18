import type { ItemResponse, StudySetResult } from './types';

/**
 * 일괄 채점 (이슈 #49, ADR-0020) — 세트 제출 시 전체 문제를 한 번에 평가한다.
 * - 선택 optionId 집합이 해당 개정의 정답 집합과 **완전 일치**할 때만 정답(순서 무관).
 * - Pass/미응답은 오답. 정답 집합이 없는 개정은 fail-closed로 오답 처리한다.
 * - 도메인은 외부 패키지·Drizzle 타입을 참조하지 않는다.
 */

export interface GradableItem {
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly response: ItemResponse;
}

export interface VersionAnswer {
  readonly questionVersionId: string;
  readonly answerOptionIds: readonly string[];
}

function sameOptionSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== a.length || right.size !== b.length) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

export function gradeItems(items: readonly GradableItem[], answers: readonly VersionAnswer[]): StudySetResult {
  const answerByVersion = new Map(answers.map((answer) => [answer.questionVersionId, answer.answerOptionIds]));

  const perItem = items.map((item) => {
    const correctOptionIds = answerByVersion.get(item.questionVersionId) ?? null;
    const selectedOptionIds = item.response.kind === 'answered' ? item.response.optionIds : [];
    const correct =
      correctOptionIds !== null &&
      item.response.kind === 'answered' &&
      sameOptionSet(selectedOptionIds, correctOptionIds);
    return {
      questionId: item.questionId,
      responseKind: item.response.kind,
      selectedOptionIds,
      correctOptionIds,
      correct,
    };
  });

  const correctCount = perItem.filter((item) => item.correct).length;
  const answeredCount = perItem.filter((item) => item.responseKind === 'answered').length;
  const passCount = perItem.filter((item) => item.responseKind === 'pass').length;
  const unansweredCount = perItem.filter((item) => item.responseKind === 'unanswered').length;
  const accuracyPercent = items.length === 0 ? 0 : Math.round((correctCount / items.length) * 100);

  return { answeredCount, correctCount, accuracyPercent, passCount, unansweredCount, perItem };
}
