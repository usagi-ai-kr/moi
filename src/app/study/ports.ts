import type { StudySet } from '@/domain/study/types';

/** 20문제 세트 application Port (이슈 #49, ADR-0020). DB/HTTP/UI는 infra에서 구현한다. */

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
  };
}

export interface QuestionPool {
  listPool(): Promise<readonly PoolEntry[]>;
}

export interface StudySetRepository {
  findActive(input: { userId: string; examId: string }): Promise<StudySet | null>;
  save(input: { set: StudySet }): Promise<void>;
  findById(input: { id: string }): Promise<StudySet | null>;
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
