import type { StudySet } from '@/domain/study/types';
import type { AttemptRecord } from '@/app/stats/attempt-ports';

/** 20문제 세트 application Port (이슈 #49, ADR-0020). DB/HTTP/UI는 infra에서 구현한다. */

/** 동시 시작 경합 — 부분 UNIQUE가 두 번째 활성 세트 저장을 거부했을 때 발생한다. */
export class ConcurrentSetConflictError extends Error {
  constructor() {
    super('study: concurrent active set');
  }
}

export interface PoolEntry {
  readonly questionId: string;
  readonly domainId: string;
  readonly domainWeight: number;
  readonly attempted: boolean;
  readonly wrongCount: number;
  readonly version: {
    readonly questionVersionId: string;
    readonly versionNo: number;
    readonly optionIds: readonly string[];
    readonly answerOptionIds: readonly string[];
    readonly stem: string;
    readonly options: ReadonlyArray<{ readonly optionId: string; readonly text: string }>;
    readonly explanation: string;
    readonly sourceUrls: readonly string[];
  };
}

export interface QuestionPool {
  listPool(): Promise<readonly PoolEntry[]>;
}

export interface StudySetRepository {
  findActive(input: { userId: string; examId: string }): Promise<StudySet | null>;
  save(input: { set: StudySet }): Promise<void>;
  findById(input: { id: string }): Promise<StudySet | null>;
  /** 조건부 제출 저장 — status='active'일 때만 submitted로 전이하고 true, 아니면 false. 동시 submit 원자성(#52). */
  submit(input: { set: StudySet; attempts?: readonly AttemptRecord[] }): Promise<boolean>;
  listCompleted(input: { userId: string; page: number; pageSize: number }): Promise<{
    items: StudySet[];
    total: number;
  }>;
}

export interface StudyClock {
  now(): number;
}

export interface StudyRng {
  next(): number;
}

export interface StudyDeps {
  readonly pool: QuestionPool;
  readonly repository: StudySetRepository;
  readonly clock: StudyClock;
  readonly rng: StudyRng;
}
