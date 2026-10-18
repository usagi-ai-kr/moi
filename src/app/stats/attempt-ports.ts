/**
 * study_attempts Port 계약 (이슈 #54, ADR-0025).
 * - 순수 타입만: drizzle/D1 import 금지.
 * - firstAttempt 계산은 이 단위에서 하지 않는다(호출부/후속).
 */
export interface AttemptRecord {
  readonly attemptId: string;
  readonly userId: string;
  readonly examId: string;
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly outcome: string;
  readonly occurredAt: number;
  readonly source: string;
  readonly sourceId: string;
  readonly excludedAt: number | null;
  readonly firstAttempt: boolean;
}

export interface StudyAttemptRepository {
  /** (source, sourceId, questionId) UNIQUE 충돌은 무시한다(멱등). */
  recordBatch(input: { readonly attempts: readonly AttemptRecord[] }): Promise<void>;
  /** 채점 가능(correct/wrong) + 제외되지 않은 시도가 있으면 true. */
  hasGradedAttempt(input: { readonly userId: string; readonly examId: string; readonly questionId: string }): Promise<boolean>;
  /** occurredAt asc, attemptId asc. */
  listByUserExam(input: { readonly userId: string; readonly examId: string }): Promise<AttemptRecord[]>;
}
