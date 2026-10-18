import type { RecheckState } from '@/domain/reports/types';

/** 재검수 큐 Port (이슈 #53). D1 행과 순수 `RecheckState`를 연결한다. */
export interface RecheckStartInput {
  readonly versionId: string;
  readonly now: number;
}

export interface RecheckFinishInput {
  readonly versionId: string;
  readonly now: number;
  readonly outcome: 'succeeded' | 'failed';
}

export interface RecheckRepository {
  /** 버전의 재검수 상태 조회. 행 없으면 null. */
  find(versionId: string): Promise<RecheckState | null>;
  /** 시작 전이. 허용 불가·경합 시 null. */
  start(input: RecheckStartInput): Promise<RecheckState | null>;
  /** 종료 전이. running이 아니면 null, 경합 시 null. */
  finish(input: RecheckFinishInput): Promise<RecheckState | null>;
}
