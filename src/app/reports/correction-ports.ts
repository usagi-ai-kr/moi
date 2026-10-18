/** 정정 이벤트 저장소 Port (이슈 #53). 구현은 infra D1 어댑터, 정정 적용·재계산은 다음 단위다. */
export interface CorrectionRecord {
  readonly id: string;
  readonly setId: string;
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly reason: string;
  readonly source: string;
  readonly actor: string;
  readonly createdAt: number;
}

export interface RecordCorrectionInput {
  readonly id: string;
  readonly setId: string;
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly reason: string;
  readonly source: string;
  /** 생략 시 `system`. */
  readonly actor?: string;
  readonly createdAt: number;
}

export interface CorrectionRepository {
  /** 정정 이벤트 저장. 같은 세트·같은 버전 중복은 `duplicate`로 변환한다. */
  record(input: RecordCorrectionInput): Promise<'recorded' | 'duplicate'>;
  /** 세트별 정정 목록 (createdAt asc, id asc). */
  listBySet(setId: string): Promise<CorrectionRecord[]>;
}
