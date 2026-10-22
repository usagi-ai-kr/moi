import type { StudySet, StudySetItem, StudySetResult, StudySetStatus } from '@/domain/study/types';
import type { studySetItems, studySets } from './schema';

/**
 * Drizzle 행 → domain 타입 변환 mapper (이슈 #49 후속, ADR-0020).
 * domain은 Drizzle 스키마 타입을 직접 참조하지 않는다 — 이 모듈만 두 계층 사이를 연결한다.
 * JSON 컬럼(mode: 'json')은 Drizzle이 파싱하므로 그대로 전달한다.
 */

type StudySetRow = typeof studySets.$inferSelect;
type StudySetItemRow = typeof studySetItems.$inferSelect;

function toStatus(status: string): StudySetStatus {
  if (status === 'active' || status === 'submitted' || status === 'abandoned') return status;
  throw new Error('study: unknown set status');
}

export function toStudyItem(row: StudySetItemRow): StudySetItem {
  const base = {
    questionId: row.questionId,
    questionVersionId: row.questionVersionId,
    versionNo: row.versionNo,
    optionOrder: row.optionOrder,
    answerOptionIds: row.answerOptionIds,
    stem: row.stem,
    options: row.options.map((o) => ({ optionId: o.optionId, text: o.text })),
    explanation: row.explanation,
    sourceUrls: [...row.sourceUrls],
  };
  switch (row.responseKind) {
    case 'answered':
      return { ...base, response: { kind: 'answered', optionIds: row.selectedOptionIds } };
    case 'pass':
      return { ...base, response: { kind: 'pass' } };
    case 'unanswered':
      return { ...base, response: { kind: 'unanswered' } };
    default:
      throw new Error('study: unknown response kind');
  }
}

export function toStudyResult(json: unknown): StudySetResult | undefined {
  if (json === null || json === undefined) return undefined;
  const r = json as StudySetResult;
  return {
    answeredCount: r.answeredCount,
    correctCount: r.correctCount,
    accuracyPercent: r.accuracyPercent,
    passCount: r.passCount,
    unansweredCount: r.unansweredCount,
    perItem: r.perItem.map((item) => ({
      questionId: item.questionId,
      responseKind: item.responseKind,
      selectedOptionIds: [...item.selectedOptionIds],
      correctOptionIds: item.correctOptionIds === null ? null : [...item.correctOptionIds],
      correct: item.correct,
    })),
  };
}

export function toStudySet(row: StudySetRow, items: StudySetItemRow[]): StudySet {
  return {
    id: row.id,
    userId: row.userId,
    examId: row.examId,
    mode: row.mode as StudySet['mode'],
    ...(row.domainId !== null ? { domainId: row.domainId } : {}),
    status: toStatus(row.status),
    createdAt: row.createdAt,
    ...(row.submittedAt !== null ? { submittedAt: row.submittedAt } : {}),
    ...(toStudyResult(row.resultJson) !== undefined ? { result: toStudyResult(row.resultJson) } : {}),
    items: items.map(toStudyItem),
  };
}
