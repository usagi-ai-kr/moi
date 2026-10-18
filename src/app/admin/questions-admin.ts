import { assertAnswerOptionIdsSubset } from '@/domain/question/question';
import type { AdminQuestionDeps } from './ports';

/**
 * 관리 문제은행 유스케이스 (이슈 #47, ADR-0019).
 * - 정답은 보기 `option_key` 집합의 부분집합이어야 한다(저장 전 검증, 키 기준).
 * - bulk는 전체 검증 통과 후에만 저장한다(원자성 — 1건이라도 오류면 저장 0).
 * - id·버전 번호는 서버가 생성한다. 물리 삭제는 제공하지 않는다.
 */

export interface BulkQuestionItem {
  readonly examCode: string;
  readonly domainCode: string;
  readonly stem: string;
  readonly explanation: string;
  readonly sourceUrls: string[];
  /** 보기 option_key 참조 (서버가 불투명 id로 변환한다). */
  readonly answerOptionKeys: string[];
  readonly optionSetHash: string;
  readonly options: Array<{ readonly optionKey: string; readonly text: string }>;
}

export interface CreatedQuestionRef {
  readonly questionId: string;
  readonly versionId: string;
  readonly versionNo: number;
}

export interface BulkFailure {
  readonly index: number;
  readonly error: string;
}

export class BulkValidationError extends Error {
  readonly failures: BulkFailure[];
  constructor(failures: BulkFailure[]) {
    super('admin: bulk validation failed');
    this.failures = failures;
  }
}

interface ResolvedItem extends BulkQuestionItem {
  readonly examId: string;
  readonly domainId: string;
}

function validateItemShape(item: BulkQuestionItem): string | null {
  if (item.stem.trim().length === 0) return 'stem must not be empty';
  if (item.explanation.trim().length === 0) return 'explanation must not be empty';
  if (item.options.length === 0) return 'options must not be empty';
  const keys = item.options.map((o) => o.optionKey);
  if (keys.some((k) => k.trim().length === 0)) return 'option_key must not be empty';
  if (new Set(keys).size !== keys.length) return 'option_key must be unique';
  if (item.answerOptionKeys.length === 0) return 'answer must not be empty';
  if (new Set(item.answerOptionKeys).size !== item.answerOptionKeys.length) {
    return 'answer must not contain duplicates';
  }
  if (!keys.every((k) => typeof k === 'string')) return 'option_key must be strings';
  const unknown = item.answerOptionKeys.filter((k) => !keys.includes(k));
  if (unknown.length > 0) return 'answer must reference option_key';
  return null;
}

async function resolveItems(
  deps: AdminQuestionDeps,
  items: BulkQuestionItem[],
): Promise<{ resolved?: ResolvedItem[]; failures?: BulkFailure[] }> {
  const failures: BulkFailure[] = [];
  const resolved: ResolvedItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const shapeError = validateItemShape(item);
    if (shapeError) {
      failures.push({ index, error: shapeError });
      continue;
    }
    const ref = await deps.exams.resolve({ examCode: item.examCode, domainCode: item.domainCode });
    if (!ref) {
      failures.push({ index, error: 'unknown exam_code or domain_code' });
      continue;
    }
    resolved.push({ ...item, examId: ref.examId, domainId: ref.domainId });
  }
  return failures.length > 0 ? { failures } : { resolved };
}

export async function importQuestionBulk(
  deps: AdminQuestionDeps,
  input: { items: BulkQuestionItem[]; actor: string; requestId: string; now: number },
): Promise<{ created: CreatedQuestionRef[] }> {
  if (input.items.length === 0) {
    throw new BulkValidationError([{ index: -1, error: 'items must not be empty' }]);
  }
  const { resolved, failures } = await resolveItems(deps, input.items);
  if (failures || !resolved) throw new BulkValidationError(failures ?? []);
  const created: CreatedQuestionRef[] = [];
  for (const item of resolved) {
    const questionId = crypto.randomUUID();
    await deps.questions.insertQuestion({ id: questionId, examId: item.examId, domainId: item.domainId, now: input.now });
    const optionIds = item.options.map(() => crypto.randomUUID());
    const answerIds = item.answerOptionKeys.map((key) => {
      const idx = item.options.findIndex((o) => o.optionKey === key);
      return optionIds[idx];
    });
    assertAnswerOptionIdsSubset(answerIds, optionIds);
    const version = await deps.questions.insertVersion({
      id: crypto.randomUUID(),
      questionId,
      stem: item.stem,
      explanation: item.explanation,
      sourceUrls: item.sourceUrls,
      answerOptionIds: answerIds,
      optionSetHash: item.optionSetHash,
      options: item.options.map((o, i) => ({ id: optionIds[i], optionKey: o.optionKey, text: o.text })),
      now: input.now,
    });
    await deps.audit({
      actor: input.actor,
      action: 'question.create',
      targetType: 'question',
      targetId: questionId,
      requestId: input.requestId,
      now: input.now,
    });
    created.push({ questionId, versionId: version.id, versionNo: version.versionNo });
  }
  return { created };
}
