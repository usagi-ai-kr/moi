/** 신고 저장소 Port (이슈 #53). 구현은 infra D1 어댑터,율 계산은 domain `computeReportRate`가 담당한다. */
export interface RecordReportInput {
  readonly id: string;
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly userId: string;
  readonly reason: string;
  readonly now: number;
}

export interface ReportRepository {
  /** 신고 저장. 같은 버전·같은 계정 중복은 `duplicate`로 변환한다. */
  record(input: RecordReportInput): Promise<'recorded' | 'duplicate'>;
  /** 버전별 고유 신고자 수·제출 풀이 고유 계정 수. */
  getRate(input: { questionVersionId: string }): Promise<{ uniqueReporters: number; solvedUsers: number }>;
  /** 재검수 큐 등록. 이미 있으면 변경 없이 둔다(insert-or-ignore). */
  ensureRecheckQueued(input: { questionVersionId: string; now: number }): Promise<void>;
}
