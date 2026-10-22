import { computeReportRate } from '@/domain/reports/report-rate';
import type { RecordReportInput, ReportRepository } from './ports';

/** 신고 제출 의존성 — 저장소는 infra D1 어댑터가 주입한다. */
export interface SubmitReportDeps {
  readonly repository: ReportRepository;
}

export type SubmitQuestionReportResult =
  | { readonly outcome: 'duplicate' }
  | {
      readonly outcome: 'recorded';
      readonly uniqueReporters: number;
      readonly solvedUsers: number;
      readonly rate: number | null;
      readonly autoStop: boolean;
      readonly requiresRecheck: boolean;
    };

/** 서로 다른 더미 ID N개 — `computeReportRate`의 Set 중복 제거와 개수가 일치한다. */
function distinctIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

/**
 * 문제 신고 제출 (이슈 #53).
 * - 중복 신고는 큐·집계 없이 `duplicate`로 종료한다.
 * - 신규 신고는 재검수 큐 등록 후 도메인율(`computeReportRate`)로 중지·재검수 여부를 반환한다.
 */
export async function submitQuestionReport(
  deps: SubmitReportDeps,
  input: RecordReportInput,
): Promise<SubmitQuestionReportResult> {
  const outcome = await deps.repository.record(input);
  if (outcome === 'duplicate') return { outcome: 'duplicate' };
  await deps.repository.ensureRecheckQueued({ questionVersionId: input.questionVersionId, now: input.now });
  const counts = await deps.repository.getRate({ questionVersionId: input.questionVersionId });
  const rate = computeReportRate({
    reporterIds: distinctIds('reporter', counts.uniqueReporters),
    solvedUserIds: distinctIds('solved', counts.solvedUsers),
  });
  return { outcome: 'recorded', ...rate };
}
