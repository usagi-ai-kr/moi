import type { StudyAttemptRepository } from '@/app/stats/attempt-ports';
import type { StudySetRepository } from '@/app/study/ports';
import { recomputeCorrectedResult } from '@/domain/study/correction';
import type { CorrectedSetResult } from '@/domain/study/types';
import type { CorrectionRepository } from './correction-ports';

/** 정정 적용 의존성 — 저장소는 infra D1 어댑터가 주입한다(이슈 #53). */
export interface ApplyCorrectionDeps {
  readonly studyRepository: StudySetRepository;
  readonly correctionRepository: CorrectionRepository;
  readonly attempts: StudyAttemptRepository;
}

export interface ApplyCorrectionInput {
  readonly userId: string;
  readonly setId: string;
  readonly questionVersionId: string;
  readonly reason: string;
  readonly source: string;
  readonly actor?: string;
  readonly now: number;
}

/** 거부 사유 — 소유권·제출 상태·세트 구성 불일치를 구분한다. */
export type ApplyCorrectionRejection =
  | 'set_not_found'
  | 'owner_mismatch'
  | 'not_submitted'
  | 'version_not_in_set';

export type ApplyCorrectionResult =
  | { readonly outcome: 'rejected'; readonly reason: ApplyCorrectionRejection }
  | {
      readonly outcome: 'applied' | 'duplicate';
      readonly corrected: CorrectedSetResult;
    };

/**
 * 완료 세트 정정 적용 (이슈 #53, ADR-0021·0025).
 * - 소유자·제출 세트·세트 내 개정 확인 후 정정 이벤트를 기록한다.
 * - 중복 정정도 재계산은 수행한다(이벤트 1행 유지 = 멱등).
 * - 해당 개정의 세트 시도(`source='set'`)를 제외 처리하고, 원본 `set.result`는 변경하지 않는다.
 */
export async function applyCorrection(
  deps: ApplyCorrectionDeps,
  input: ApplyCorrectionInput,
): Promise<ApplyCorrectionResult> {
  const { userId, setId, questionVersionId, reason, source, actor, now } = input;

  const set = await deps.studyRepository.findById({ id: setId });
  if (set === null) return { outcome: 'rejected', reason: 'set_not_found' };
  if (set.userId !== userId) return { outcome: 'rejected', reason: 'owner_mismatch' };
  if (set.status !== 'submitted') return { outcome: 'rejected', reason: 'not_submitted' };

  const item = set.items.find((i) => i.questionVersionId === questionVersionId);
  if (item === undefined) return { outcome: 'rejected', reason: 'version_not_in_set' };

  const recorded = await deps.correctionRepository.record({
    id: crypto.randomUUID(),
    setId,
    questionId: item.questionId,
    questionVersionId,
    reason,
    source,
    ...(actor !== undefined ? { actor } : {}),
    createdAt: now,
  });

  // 중복도 idempotent하게 다시 제외 처리한다(같은 값 UPDATE).
  await deps.attempts.excludeSetVersion({ userId, setId, questionVersionId, now });

  const corrected = recomputeCorrectedResult(set, [questionVersionId]);
  return { outcome: recorded === 'recorded' ? 'applied' : 'duplicate', corrected };
}
