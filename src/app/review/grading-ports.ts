import type { ReviewSession } from '@/domain/review/types';

/** 복습 원자 채점 저장 Port (이슈 #54, ADR-0020/0025/0027/0028). DB/HTTP/UI는 infra가 구현한다. */

export type ReviewGradingOutcome = 'correct' | 'wrong' | 'pass';

export interface ReviewGradingAttempt {
  readonly attemptId: string;
  readonly userId: string;
  readonly examId: string;
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly outcome: ReviewGradingOutcome;
  /** AttemptRecord(ms) 단위 그대로 — 초 변환 금지. */
  readonly occurredAt: number;
}

export interface ReviewGradingRepository {
  /**
   * 회차 cursor/items 갱신 + study_attempts 1행을 같은 D1 batch에 원자 저장한다.
   * - session은 채점 반영 후 스냅샷(cursor=expectedCursor+1, 해당 item graded).
   * - 오래된 cursor/종료/다른 소유권은 false·쓰기 0건. 경합은 1명만 true.
   * - firstAttempt는 caller 값이 아니라 트랜잭션 내 SQL로 산정한다.
   */
  commit(input: {
    readonly session: ReviewSession;
    readonly expectedCursor: number;
    readonly attempt: ReviewGradingAttempt;
  }): Promise<boolean>;
}
