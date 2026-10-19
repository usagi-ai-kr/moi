import type { ReviewSession } from '@/domain/review/types';
import type { VersionContent } from './content';

/** 미채점 문항 DTO — 정답·해설·근거 없음. */
export interface PendingItemDto {
  readonly questionId: string;
  readonly stem: string;
  readonly options: ReadonlyArray<{ readonly optionId: string; readonly text: string }>;
  readonly response: null;
}

/** 후보 요약 DTO — 정답·해설 없음. */
export function toCandidateDto(input: {
  questionId: string;
  validWrongCount: number;
  content: VersionContent | undefined;
}): { questionId: string; validWrongCount: number; stem: string; options: { optionId: string; text: string }[] } | null {
  if (!input.content) return null;
  return {
    questionId: input.questionId,
    validWrongCount: input.validWrongCount,
    stem: input.content.stem,
    options: input.content.options.map((o) => ({ optionId: o.optionId, text: o.text })),
  };
}

/** 세션 스냅샷의 보기 순서를 따라 옵션을 정렬한다. */
export function orderedOptions(
  item: { optionOrder: readonly string[] },
  content: VersionContent | undefined,
): { optionId: string; text: string }[] {
  if (!content) return [];
  const byId = new Map(content.options.map((o) => [o.optionId, o.text]));
  const out: { optionId: string; text: string }[] = [];
  for (const id of item.optionOrder) {
    const text = byId.get(id);
    if (text !== undefined) out.push({ optionId: id, text });
  }
  return out;
}

export function toPendingDto(
  item: { questionId: string; optionOrder: readonly string[] },
  content: VersionContent | undefined,
): PendingItemDto | null {
  if (!content) return null;
  return { questionId: item.questionId, stem: content.stem, options: orderedOptions(item, content), response: null };
}

/** 재개용 항목 복원 — 채점됨은 response+correct만, 미채점은 null만. 정답·해설 없음. */
export function toResumeItems(session: ReviewSession): Array<{ questionId: string; response: unknown; correct?: boolean }> {
  return session.items.map((item) =>
    item.state.kind === 'graded'
      ? { questionId: item.questionId, response: item.state.response, correct: item.state.correct }
      : { questionId: item.questionId, response: null },
  );
}
