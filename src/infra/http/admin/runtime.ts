import { createD1IdempotencyStore } from '@/infra/persistence/admin-idempotency-store';
import { createD1AdminTokenRepository } from '@/infra/persistence/admin-token-repository';
import { createD1QuestionBankRepository } from '@/infra/persistence/d1-question-bank-repository';
import { createD1AdminAuditStore } from '@/infra/persistence/admin-audit-store';
import { createD1AdminExamResolver } from '@/infra/persistence/admin-exam-resolver';
import type { AdminAuditStore, AdminExamResolver, AdminTokenRepository, IdempotencyStore } from '@/app/admin/ports';
import type { QuestionBankRepository } from '@/app/question/ports';
import { createJsonLogger, type JsonLogger, type JsonLogSink } from '@/infra/logging/json-logger';

/**
 * 관리 API 런타임 조립 (이슈 #47, ADR-0019).
 * - D1 어댑터 + 화이트리스트 로거. 토큰·payload 원문은 로그·DB에 닿지 않는다.
 * - `sink`은 테스트에서 로그 캡처용으로만 교체한다.
 */

export interface AdminRuntime {
  readonly db: D1Database;
  readonly logger: JsonLogger;
  readonly tokens: AdminTokenRepository;
  readonly idempotency: IdempotencyStore;
  readonly questions: QuestionBankRepository;
  readonly exams: AdminExamResolver;
  readonly audits: AdminAuditStore;
  now(): number;
}

export function createAdminRuntime(env: Env, requestId: string, sink?: JsonLogSink): AdminRuntime {
  const db = env.DB;
  return {
    db,
    logger: createJsonLogger(requestId, sink),
    tokens: createD1AdminTokenRepository(db),
    idempotency: createD1IdempotencyStore(db),
    questions: createD1QuestionBankRepository(db),
    exams: createD1AdminExamResolver(db),
    audits: createD1AdminAuditStore(db),
    now: () => Math.floor(Date.now() / 1000),
  };
}
