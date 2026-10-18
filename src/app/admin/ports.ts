/**
 * 관리 API 영속성 Port (이슈 #47, ADR-0019).
 * - 토큰 원문은 어떤 계층에도 저장하지 않는다. 검증은 해시 조회로만 수행한다.
 * - 멱등 저장소는 요청 해시와 응답 재현분만 보관한다(토큰·payload 원문 금지).
 */

export interface AdminTokenInfo {
  readonly actor: string;
  readonly scope: string;
}

export interface AdminTokenRepository {
  /** Bearer 원문 검증 — 해시 조회 + 폐기 확인. 실패 시 null(사유를 구분하지 않는다). */
  verifyToken(input: { token: string }): Promise<AdminTokenInfo | null>;
  /** 토큰 발급 기록(운영 절차·테스트용) — 원문은 호출자가 보관하고 서버는 해시만 저장한다. */
  registerToken(input: { token: string; actor: string; scope: string; now: number }): Promise<{ id: string }>;
  /** 개별 폐기 — 이후 verifyToken은 null을 반환한다. */
  revokeToken(input: { actor: string; now: number }): Promise<void>;
}

export interface IdempotencyRecord {
  readonly key: string;
  readonly requestHash: string;
  readonly statusCode: number;
  readonly responseBody: string;
  readonly createdAt: number;
}

export interface IdempotencyStore {
  computeRequestHash(input: { method: string; path: string; bodyText: string }): Promise<string>;
  findByKey(input: { key: string }): Promise<IdempotencyRecord | null>;
  save(input: { key: string; requestHash: string; statusCode: number; responseBody: string; now: number }): Promise<void>;
}

import type { QuestionBankRepository } from '@/app/question/ports';

export interface AdminQuestionDeps {
  readonly questions: QuestionBankRepository;
  readonly exams: AdminExamResolver;
  readonly audit: (input: {
    actor: string;
    action: string;
    targetType: string;
    targetId: string;
    requestId: string;
    now: number;
  }) => Promise<void>;
}

export interface AdminExamResolver {
  resolve(input: { examCode: string; domainCode: string }): Promise<{ examId: string; domainId: string } | null>;
}

export interface AdminAuditStore {
  list(input: { limit: number; offset: number }): Promise<{ items: Array<{ actor: string; action: string; targetType: string; targetId: string; requestId: string; createdAt: number }>; total: number }>;
}
