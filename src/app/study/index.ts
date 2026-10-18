import { assertStudySetInvariants } from '@/domain/study/invariants';
import { gradeItems, type GradableItem } from '@/domain/study/grading';
import { shuffleOptionOrder, unattemptedFirst, weightedSample, WEAK_WEIGHT_BASE } from '@/domain/study/selection';
import { STUDY_SET_SIZE } from '@/domain/study/thresholds';
import type { ItemResponse, StudySet, StudySetItem, StudySetMode, StudySetSummary } from '@/domain/study/types';
import type { PoolEntry, StudyDeps } from './ports';

/**
 * 20문제 세트 use case (이슈 #49, ADR-0020).
 * - 활성 세트 1개(계정·시험), 시작 시 문제 버전·보기 순서 스냅샷.
 * - 미풀이 우선, 소진 시 유효 누적 오답 가중. 세트 내 중복 0.
 * - 제출 시 일괄 채점, Pass/미응답은 오답. 포기는 채점/통계 미반영.
 */

export type StartStudySetResult =
  | { readonly outcome: 'started'; readonly set: StudySet }
  | { readonly outcome: 'rejected'; readonly reason: 'active_set_exists' | 'domain_required' | 'pool_insufficient' };

export type AnswerStudyItemResult =
  | { readonly outcome: 'answered' | 'pass' | 'unanswered' }
  | { readonly outcome: 'rejected'; readonly reason: 'not_found' | 'not_active' | 'unknown_option' };

export type SubmitStudySetResult =
  | { readonly outcome: 'submitted'; readonly set: StudySet }
  | { readonly outcome: 'rejected'; readonly reason: 'not_found' | 'not_active' | 'unanswered_not_confirmed' };

export type AbandonStudySetResult =
  | { readonly outcome: 'abandoned'; readonly set: StudySet }
  | { readonly outcome: 'rejected'; readonly reason: 'not_found' | 'not_active' | 'not_confirmed' };

export interface CompletedSetsPage {
  readonly items: readonly StudySetSummary[];
  readonly total: number;
}

export async function startStudySet(
  deps: StudyDeps,
  input: { userId: string; examId: string; mode: StudySetMode; domainId?: string },
): Promise<StartStudySetResult> {
  if (input.mode === 'domain' && (input.domainId === undefined || input.domainId.length === 0)) {
    return { outcome: 'rejected', reason: 'domain_required' };
  }
  const active = await deps.repository.findActive({ userId: input.userId, examId: input.examId });
  if (active !== null) return { outcome: 'rejected', reason: 'active_set_exists' };

  const all = await deps.pool.listPool();
  const filtered = input.mode === 'domain' ? all.filter((entry) => entry.domainId === input.domainId) : all;
  if (filtered.length < STUDY_SET_SIZE) return { outcome: 'rejected', reason: 'pool_insufficient' };

  const rng = () => deps.rng.next();
  const unseen = unattemptedFirst(filtered, []);
  const seen = filtered.filter((entry) => entry.attempted);
  const firstWeight = (entry: PoolEntry): number => {
    if (input.mode === 'all') return entry.domainWeight;
    if (input.mode === 'weak') return WEAK_WEIGHT_BASE;
    return 1;
  };
  const seenWeight = (entry: PoolEntry): number => WEAK_WEIGHT_BASE + Math.max(0, entry.wrongCount);

  const picked = weightedSample(
    unseen.map((entry) => ({ weight: firstWeight(entry), value: entry })),
    STUDY_SET_SIZE,
    rng,
  ).map((entry) => entry.value);

  if (picked.length < STUDY_SET_SIZE) {
    const pickedIds = new Set(picked.map((entry) => entry.questionId));
    const fill = weightedSample(
      seen
        .filter((entry) => !pickedIds.has(entry.questionId))
        .map((entry) => ({ weight: seenWeight(entry), value: entry })),
      STUDY_SET_SIZE - picked.length,
      rng,
    ).map((entry) => entry.value);
    picked.push(...fill);
  }

  const items: StudySetItem[] = picked.slice(0, STUDY_SET_SIZE).map((entry) => ({
    questionId: entry.questionId,
    questionVersionId: entry.version.questionVersionId,
    versionNo: entry.version.versionNo,
    optionOrder: shuffleOptionOrder(entry.version.optionIds, rng),
    answerOptionIds: [...entry.version.answerOptionIds],
    stem: entry.version.stem,
    options: entry.version.options.map((o) => ({ optionId: o.optionId, text: o.text })),
    explanation: entry.version.explanation,
    sourceUrls: [...entry.version.sourceUrls],
    response: { kind: 'unanswered' },
  }));

  const set: StudySet = {
    id: crypto.randomUUID(),
    userId: input.userId,
    examId: input.examId,
    mode: input.mode,
    ...(input.domainId !== undefined ? { domainId: input.domainId } : {}),
    status: 'active',
    createdAt: deps.clock.now(),
    items,
  };
  assertStudySetInvariants(set);
  await deps.repository.save({ set });
  return { outcome: 'started', set };
}

export async function answerStudyItem(
  deps: StudyDeps,
  input: { setId: string; userId: string; questionId: string; response: ItemResponse },
): Promise<AnswerStudyItemResult> {
  const set = await deps.repository.findById({ id: input.setId });
  if (set === null || set.userId !== input.userId) return { outcome: 'rejected', reason: 'not_found' };
  if (set.status !== 'active') return { outcome: 'rejected', reason: 'not_active' };
  const index = set.items.findIndex((item) => item.questionId === input.questionId);
  if (index === -1) return { outcome: 'rejected', reason: 'not_found' };

  const item = set.items[index] as StudySetItem;
  if (input.response.kind === 'answered') {
    const allowed = new Set(item.optionOrder);
    if (input.response.optionIds.length === 0 || input.response.optionIds.some((id) => !allowed.has(id))) {
      return { outcome: 'rejected', reason: 'unknown_option' };
    }
  }
  const items = set.items.map((candidate, i) => (i === index ? { ...candidate, response: input.response } : candidate));
  await deps.repository.save({ set: { ...set, items } });
  return { outcome: input.response.kind };
}

export async function submitStudySet(
  deps: StudyDeps,
  input: { setId: string; userId: string; confirmUnanswered: boolean },
): Promise<SubmitStudySetResult> {
  const set = await deps.repository.findById({ id: input.setId });
  if (set === null || set.userId !== input.userId) return { outcome: 'rejected', reason: 'not_found' };
  if (set.status !== 'active') return { outcome: 'rejected', reason: 'not_active' };
  if (!input.confirmUnanswered && set.items.some((item) => item.response.kind === 'unanswered')) {
    return { outcome: 'rejected', reason: 'unanswered_not_confirmed' };
  }

  const gradable: GradableItem[] = set.items.map((item) => ({
    questionId: item.questionId,
    questionVersionId: item.questionVersionId,
    response: item.response,
  }));
  const answers = set.items.map((item) => ({
    questionVersionId: item.questionVersionId,
    answerOptionIds: item.answerOptionIds,
  }));
  const result = gradeItems(gradable, answers);
  const submitted: StudySet = { ...set, status: 'submitted', submittedAt: deps.clock.now(), result };
  await deps.repository.save({ set: submitted });
  return { outcome: 'submitted', set: submitted };
}

export async function abandonStudySet(
  deps: StudyDeps,
  input: { setId: string; userId: string; confirm: boolean },
): Promise<AbandonStudySetResult> {
  if (!input.confirm) return { outcome: 'rejected', reason: 'not_confirmed' };
  const set = await deps.repository.findById({ id: input.setId });
  if (set === null || set.userId !== input.userId) return { outcome: 'rejected', reason: 'not_found' };
  if (set.status !== 'active') return { outcome: 'rejected', reason: 'not_active' };
  const abandoned: StudySet = { ...set, status: 'abandoned', result: undefined };
  await deps.repository.save({ set: abandoned });
  return { outcome: 'abandoned', set: abandoned };
}

export async function listCompletedSets(
  deps: StudyDeps,
  input: { userId: string; page: number; pageSize: number },
): Promise<CompletedSetsPage> {
  const page = await deps.repository.listCompleted(input);
  const items: StudySetSummary[] = page.items.filter((set) => set.status === 'submitted').map((set) => ({
    id: set.id,
    examId: set.examId,
    mode: set.mode,
    ...(set.domainId !== undefined ? { domainId: set.domainId } : {}),
    submittedAt: set.submittedAt ?? 0,
    correctCount: set.result?.correctCount ?? 0,
    accuracyPercent: set.result?.accuracyPercent ?? 0,
  }));
  return { items, total: page.total };
}
