import type { CorrectedSetPerItem, CorrectedSetResult, StudySet } from './types';

/**
 * 완료 세트 정정 재계산 (이슈 #53, ADR-0021·0025).
 * - 최초 답안·채점(`set.result`/`set.items`)은 변경하지 않고, 지정한 문제 개정만 채점에서 제외해
 *   유효 분모로 다시 계산한다(행 삭제·원본 덮어쓰기 금지).
 * - 제외 문항도 `perItem` 이력에 남는다(`excluded` 표시) — 최초/정정을 나란히 보존한다.
 * - 유효 분모 0은 `accuracyPercent: null` + `ungraded: true`(채점 불가)로 표현하고 throw하지 않는다.
 * - 도메인은 외부 패키지·Drizzle 타입을 참조하지 않는다.
 */

function toVersionIdSet(ids: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  return ids instanceof Set ? ids : new Set(ids);
}

export function recomputeCorrectedResult(
  set: StudySet,
  excludedQuestionVersionIds: ReadonlySet<string> | readonly string[],
): CorrectedSetResult {
  if (set.status !== 'submitted') {
    throw new Error(`study: ${set.status} 세트는 정정 재계산할 수 없다`);
  }
  const result = set.result;
  if (result === undefined) {
    throw new Error('study: 정정 재계산에는 제출 세트의 결과가 필요하다');
  }

  const excluded = toVersionIdSet(excludedQuestionVersionIds);
  const versionIdByQuestionId = new Map(set.items.map((item) => [item.questionId, item.questionVersionId]));
  const excludedVersionIds: string[] = [];

  const perItem: CorrectedSetPerItem[] = result.perItem.map((item) => {
    const versionId = versionIdByQuestionId.get(item.questionId);
    if (versionId !== undefined && excluded.has(versionId)) {
      excludedVersionIds.push(versionId);
      return { ...item, excluded: true };
    }
    return { ...item, excluded: false };
  });

  const valid = perItem.filter((item) => !item.excluded);
  const correctCount = valid.filter((item) => item.correct).length;
  const answeredCount = valid.filter((item) => item.responseKind === 'answered').length;
  const passCount = valid.filter((item) => item.responseKind === 'pass').length;
  const unansweredCount = valid.filter((item) => item.responseKind === 'unanswered').length;
  const validTotal = valid.length;
  const accuracyPercent = validTotal === 0 ? null : Math.round((correctCount / validTotal) * 100);

  return {
    answeredCount,
    correctCount,
    accuracyPercent,
    passCount,
    unansweredCount,
    ungraded: validTotal === 0,
    validTotal,
    excludedCount: excludedVersionIds.length,
    excludedQuestionVersionIds: excludedVersionIds,
    perItem,
  };
}
