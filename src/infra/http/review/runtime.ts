import { createD1ReviewGradingRepository } from '@/infra/persistence/review-grading-repository';
import { createD1ReviewExamResolver, type ResolvedReviewExam } from '@/infra/persistence/review-exam-resolver';
import { createD1ReviewSessionRepository } from '@/infra/persistence/review-session-repository';
import { createD1ReviewSource } from '@/infra/persistence/review-source-repository';
import { createJsonLogger, type JsonLogger, type JsonLogSink } from '@/infra/logging/json-logger';
import type { ReviewDeps } from '@/app/review/ports';

/**
 * 복습 런타임 조립 (#130, ADR-0037/0039).
 * - D1 어댑터 + 화이트리스트 로거. clock은 epoch seconds, rng는 Math.random.
 * - app원자 Port만 사용한다. 순차 save+record fallback·스텁 금지.
 */
export interface ReviewRuntime {
  readonly logger: JsonLogger;
  resolveExam(examIdOrCode: string): Promise<ResolvedReviewExam | null>;
  createDeps(input: { db: D1Database }): ReviewDeps;
}

export function createReviewRuntime(env: Env, requestId: string, sink?: JsonLogSink): ReviewRuntime {
  const examResolver = createD1ReviewExamResolver(env.DB);
  return {
    logger: createJsonLogger(requestId, sink),
    resolveExam: (examIdOrCode) => examResolver.resolve(examIdOrCode),
    createDeps: ({ db: target }) => ({
      source: createD1ReviewSource(target),
      repository: createD1ReviewSessionRepository(target),
      grading: createD1ReviewGradingRepository(target),
      clock: { now: () => Math.floor(Date.now() / 1000) },
      rng: { next: () => Math.random() },
    }),
  };
}
