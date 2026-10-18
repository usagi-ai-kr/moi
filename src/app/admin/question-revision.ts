import type { Question, QuestionOption, QuestionVersion } from '@/domain/question/question';
import { BulkValidationError } from './questions-admin';
import type { AdminQuestionDeps } from './ports';

/**
 * 문제 개정·비활성화·조회 유스케이스 (이슈 #47, ADR-0019).
 * - PATCH는 부분 수정분을 현재 개정에 병합해 새 개정으로 저장한다.
 * - 비활성화는 상태만 바꾸고 row를 보존한다(물리 삭제 없음).
 */

export class QuestionNotFoundError extends Error {
  constructor(questionId: string) {
    super(`admin: question not found (${questionId})`);
  }
}

export interface ReviseInput {
  readonly questionId: string;
  readonly stem?: string;
  readonly explanation?: string;
  readonly sourceUrls?: string[];
  readonly answerOptionKeys?: string[];
  readonly optionSetHash?: string;
  readonly options?: Array<{ readonly optionKey: string; readonly text: string }>;
  readonly actor: string;
  readonly requestId: string;
  readonly now: number;
}

export async function reviseQuestionVersion(
  deps: AdminQuestionDeps,
  input: ReviseInput,
): Promise<{ id: string; versionNo: number }> {
  const question = await deps.questions.findQuestion({ questionId: input.questionId });
  if (!question) throw new QuestionNotFoundError(input.questionId);
  const current = await deps.questions.findVersion({ questionId: input.questionId });
  if (!current && (input.stem === undefined || input.explanation === undefined || input.options === undefined || input.answerOptionKeys === undefined)) {
    throw new BulkValidationError([{ index: -1, error: 'first version requires stem/explanation/options/answer' }]);
  }
  const currentOptions = current
    ? await deps.questions.findOptionsByVersion({ questionVersionId: current.id })
    : [];
  const effectiveOptions =
    input.options ?? currentOptions.map((o) => ({ optionKey: o.optionKey, text: o.text }));
  if (effectiveOptions.length === 0) {
    throw new BulkValidationError([{ index: -1, error: 'options must not be empty' }]);
  }
  const keys = effectiveOptions.map((o) => o.optionKey);
  if (new Set(keys).size !== keys.length) {
    throw new BulkValidationError([{ index: -1, error: 'option_key must be unique' }]);
  }
  const keyById = new Map(currentOptions.map((o) => [o.id, o.optionKey] as const));
  const currentAnswerKeys = (current?.answerOptionIds ?? [])
    .map((id) => keyById.get(id))
    .filter((k): k is string => typeof k === 'string');
  const answerKeys = input.answerOptionKeys ?? currentAnswerKeys;
  const unknown = answerKeys.filter((k) => !keys.includes(k));
  if (answerKeys.length === 0 || unknown.length > 0) {
    throw new BulkValidationError([{ index: -1, error: 'answer must reference option_key' }]);
  }
  const optionIds = effectiveOptions.map(() => crypto.randomUUID());
  const answerIds = answerKeys.map((key) => optionIds[keys.indexOf(key)]);
  const version = await deps.questions.insertVersion({
    id: crypto.randomUUID(),
    questionId: input.questionId,
    stem: input.stem ?? current?.stem ?? '',
    explanation: input.explanation ?? current?.explanation ?? '',
    sourceUrls: input.sourceUrls ?? current?.sourceUrls ?? [],
    answerOptionIds: answerIds,
    optionSetHash: input.optionSetHash ?? current?.optionSetHash ?? '',
    options: effectiveOptions.map((o, i) => ({ id: optionIds[i], optionKey: o.optionKey, text: o.text })),
    now: input.now,
  });
  await deps.audit({
    actor: input.actor,
    action: 'question.revise',
    targetType: 'question_version',
    targetId: version.id,
    requestId: input.requestId,
    now: input.now,
  });
  return { id: version.id, versionNo: version.versionNo };
}

/** 비활성화 — 물리 삭제 없이 status만 바꾼다. */
export async function retireQuestion(
  deps: AdminQuestionDeps,
  input: { questionId: string; actor: string; requestId: string; now: number },
): Promise<void> {
  const question = await deps.questions.findQuestion({ questionId: input.questionId });
  if (!question) throw new QuestionNotFoundError(input.questionId);
  await deps.questions.deactivateQuestion({ questionId: input.questionId, now: input.now });
  await deps.audit({
    actor: input.actor,
    action: 'question.deactivate',
    targetType: 'question',
    targetId: input.questionId,
    requestId: input.requestId,
    now: input.now,
  });
}

export interface QuestionDetail {
  readonly question: Question;
  readonly version: QuestionVersion | null;
  readonly options: QuestionOption[];
}

/** 단건 조회 — 현재 개정 + 보기 포함. */
export async function fetchQuestionDetail(
  questions: AdminQuestionDeps['questions'],
  input: { questionId: string },
): Promise<QuestionDetail | null> {
  const question = await questions.findQuestion({ questionId: input.questionId });
  if (!question) return null;
  const version = await questions.findVersion({ questionId: input.questionId });
  const options = version ? await questions.findOptionsByVersion({ questionVersionId: version.id }) : [];
  return { question, version, options };
}
