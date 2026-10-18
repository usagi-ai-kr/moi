import type { StudyDeps } from '@/app/study/ports';
import { createD1QuestionPool } from '@/infra/persistence/study-pool';
import { createD1StudySetRepository } from '@/infra/persistence/study-repository';
import { createJsonLogger, type JsonLogger, type JsonLogSink } from '@/infra/logging/json-logger';

/**
 * 학습 세트 런타임 조립 (이슈 #49 후속, ADR-0020).
 * - D1 어댑터 + 화이트리스트 로거. clock은 epoch seconds, rng는 Math.random.
 * - pool은 요청별 examId로 스코프한다(시험 분리).
 * - `sink`은 테스트에서 로그 캡처용으로만 교체한다.
 */

export interface StudyRuntime {
  readonly logger: JsonLogger;
  createDeps(input: { examId: string; db: D1Database }): StudyDeps;
}

export function createStudyRuntime(env: Env, requestId: string, sink?: JsonLogSink): StudyRuntime {
  const db = env.DB;
  return {
    logger: createJsonLogger(requestId, sink),
    createDeps: ({ examId }) => ({
      pool: createD1QuestionPool(db, examId),
      repository: createD1StudySetRepository(db),
      clock: { now: () => Math.floor(Date.now() / 1000) },
      rng: { next: () => Math.random() },
    }),
  };
}
