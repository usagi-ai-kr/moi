import type { RecheckRepository, ReviewerPort } from './recheck-port';

/** 배치 실행 의존성 (이슈 #53). Cron 등록·Secret은 #55 후속이다. */
export interface RunRecheckBatchDeps {
  readonly repository: RecheckRepository;
  readonly reviewer: ReviewerPort;
  readonly now: number;
  readonly limit?: number;
}

export interface RecheckBatchItem {
  readonly versionId: string;
  readonly outcome: 'succeeded' | 'failed';
  readonly reason?: string;
}

const DEFAULT_BATCH_LIMIT = 10;

/**
 * 재검수 배치 — due를 골라 `start → reviewer → finish`를 실행한다.
 * - `start` null이면 경합·조건 변경으로 보고 skip한다.
 * - reviewer 예외는 failed로 변환하고 배치를 계속한다.
 * - `finish` null(경합)이면 결과에 추가하지 않고 skip한다.
 * - succeeded는 재실행 안 됨, failed는 24h 후·3회까지(`canStartRecheck`).
 */
export async function runRecheckBatch(deps: RunRecheckBatchDeps): Promise<RecheckBatchItem[]> {
  const limit = deps.limit ?? DEFAULT_BATCH_LIMIT;
  const due = await deps.repository.listDue({ now: deps.now, limit });
  const results: RecheckBatchItem[] = [];
  for (const item of due) {
    const started = await deps.repository.start({ versionId: item.versionId, now: deps.now });
    if (started === null) continue;
    let outcome: 'succeeded' | 'failed';
    let reason: string | undefined;
    try {
      const reviewed = await deps.reviewer.review({ versionId: item.versionId });
      outcome = reviewed.outcome;
      reason = reviewed.reason;
    } catch {
      outcome = 'failed';
      reason = 'reviewer-error';
    }
    const finished = await deps.repository.finish({ versionId: item.versionId, now: deps.now, outcome });
    if (finished === null) continue;
    if (reason === undefined) results.push({ versionId: item.versionId, outcome });
    else results.push({ versionId: item.versionId, outcome, reason });
  }
  return results;
}
