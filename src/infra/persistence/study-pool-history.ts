export interface StudyPoolAttemptHistoryEntry {
  readonly userId: string;
  readonly examId: string;
  readonly questionId: string;
  readonly outcome: string;
  readonly source: string;
  readonly setStatus: string;
}

export interface StudyPoolAttemptScope {
  readonly userId: string;
  readonly examId: string;
}

/** 제출 완료한 세트에서 채점된 정답·오답만 기풀이로 표시한다 (#311, ADR-0087). */
export function collectCompletedAttemptedQuestionIds(
  rows: readonly StudyPoolAttemptHistoryEntry[],
  scope: StudyPoolAttemptScope,
): Set<string> {
  const attempted = new Set<string>();
  for (const row of rows) {
    if (
      row.userId !== scope.userId ||
      row.examId !== scope.examId ||
      row.source !== 'set' ||
      row.setStatus !== 'submitted' ||
      (row.outcome !== 'correct' && row.outcome !== 'wrong')
    ) {
      continue;
    }
    attempted.add(row.questionId);
  }
  return attempted;
}
