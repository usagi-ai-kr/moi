import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle 스키마 — infra(persistence) 전용. domain/app은 이 타입을 참조하지 않는다(ADR-0001/0004).
 *
 * `oauth_states` (이슈 #2, ADR-0003): 카카오 로그인 트랜잭션 상태.
 * - 원문 state/browser binding은 저장하지 않고 SHA-256 hex 해시만 저장한다.
 * - `state_hash` PK, 조건부 단일 UPDATE(... RETURNING)로 1회 소비(fail-closed)한다.
 * - 시간은 epoch seconds (INTEGER, mode number).
 */
export const oauthStates = sqliteTable('oauth_states', {
  stateHash: text('state_hash').primaryKey(),
  browserBindingHash: text('browser_binding_hash').notNull(),
  nonce: text('nonce').notNull(),
  pkceVerifier: text('pkce_verifier').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
});

/**
 * `users` (이슈 #3, ADR-0004): 내부 사용자 — 데이터 소유권 기준 UUID PK.
 * 이메일/닉네임은 핵심키가 아니므로 컬럼을 두지 않는다(profile consent 필수화 금지).
 * 0.1.3(#4) sessions가 이 테이블을 참조한다.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * `external_identities` (이슈 #3, ADR-0004): 외부 계정 → 내부 user_id 1:1 매핑.
 * - `UNIQUE(provider, provider_subject)`: 동시 최초 로그인 경합의 원자적 승부처.
 * - `INDEX(user_id)`: user 기준 역방향 조회.
 * - 이메일/닉네임/동의 상태를 저장하지 않는다.
 */
export const externalIdentities = sqliteTable(
  'external_identities',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('external_identities_provider_subject_uq').on(table.provider, table.providerSubject),
    index('external_identities_user_id_idx').on(table.userId),
  ],
);

/**
 * `sessions` (이슈 #4, ADR-0005): 세션 발급/폐기 기록.
 * - `jti_hash` PK — PASETO 원문 저장 금지, SHA-256(jti)만 저장한다.
 * - `user_id` FK→users.id. `revoked_at`: 로그아웃/강제 폐기 즉시 적용.
 * - 보호 요청마다 `revoked_at IS NULL AND expires_at > now`로 활성 검사.
 */
export const sessions = sqliteTable('sessions', {
  jtiHash: text('jti_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  issuedAt: integer('issued_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
});

/**
 * `exams` (이슈 #46, ADR-0019): 시험 — 시험 독립 구조의 최상위.
 * - `code` UNIQUE(예: 'saa-c03'). 다른 자격시험은 행 추가로 확장한다.
 */
export const exams = sqliteTable('exams', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * `exam_domains` (이슈 #46, ADR-0019): 시험별 출제 영역 + 가중치.
 * - `UNIQUE(exam_id, code)`: 시험 안에서 영역 코드 중복 금지.
 * - `weight`: 영역 배분 가중치(정수 percent, SAA-C03 합 100).
 */
export const examDomains = sqliteTable(
  'exam_domains',
  {
    id: text('id').primaryKey(),
    examId: text('exam_id')
      .notNull()
      .references(() => exams.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    weight: integer('weight').notNull(),
  },
  (table) => [
    uniqueIndex('exam_domains_exam_code_uq').on(table.examId, table.code),
    index('exam_domains_exam_id_idx').on(table.examId),
  ],
);

/**
 * `questions` (이슈 #46, ADR-0019): 문제 — 버전과 분리된 식별자.
 * - `status`: 'active' | 'inactive'. 풀이 이력이 있는 문제는 물리 삭제 대신 비활성화한다.
 * - `current_version_no`: 최신 개정 번호(NULL = 아직 버전 없음).
 */
export const questions = sqliteTable(
  'questions',
  {
    id: text('id').primaryKey(),
    examId: text('exam_id')
      .notNull()
      .references(() => exams.id),
    domainId: text('domain_id')
      .notNull()
      .references(() => examDomains.id),
    status: text('status').notNull().default('active'),
    currentVersionNo: integer('current_version_no'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('questions_exam_status_idx').on(table.examId, table.status)],
);

/**
 * `question_versions` (이슈 #46, ADR-0019): 문제 개정 — 본문·보기·정답 스냅샷 단위.
 * - `UNIQUE(question_id, version_no)`: 개정 번호 단조 증가.
 * - `answer_option_ids`: 정답 보기 id 집합(JSON) — 저장 전 option id 부분집합 검증을 통과해야 한다.
 * - `option_set_hash`: 보기 집합 지문(중복·순열 검수용). `review_status`: 검수 상태.
 */
export const questionVersions = sqliteTable(
  'question_versions',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    versionNo: integer('version_no').notNull(),
    stem: text('stem').notNull(),
    explanation: text('explanation').notNull(),
    sourceUrls: text('source_urls', { mode: 'json' }).$type<string[]>().notNull(),
    answerOptionIds: text('answer_option_ids', { mode: 'json' }).$type<string[]>().notNull(),
    optionSetHash: text('option_set_hash').notNull(),
    reviewStatus: text('review_status').notNull().default('pending'),
    createdAt: integer('created_at').notNull(),
    supersededAt: integer('superseded_at'),
  },
  (table) => [
    uniqueIndex('question_versions_question_version_uq').on(table.questionId, table.versionNo),
    index('question_versions_question_id_idx').on(table.questionId),
  ],
);

/**
 * `question_options` (이슈 #46, ADR-0019): 개정별 보기 — 화면상 번호/위치와 분리된 고유 id.
 * - `UNIQUE(question_version_id, option_key)`: 개정 안에서 보기 키 중복 금지.
 */
export const questionOptions = sqliteTable(
  'question_options',
  {
    id: text('id').primaryKey(),
    questionVersionId: text('question_version_id')
      .notNull()
      .references(() => questionVersions.id),
    optionKey: text('option_key').notNull(),
    text: text('text').notNull(),
  },
  (table) => [
    uniqueIndex('question_options_version_key_uq').on(table.questionVersionId, table.optionKey),
    index('question_options_version_id_idx').on(table.questionVersionId),
  ],
);

/**
 * `audit_logs` (이슈 #46, ADR-0019): 관리 작업 감사 최소 골격.
 * - actor/action/대상/요청 id만 기록한다. 토큰·개인정보 원문 저장 금지(ADR-0006).
 */
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  requestId: text('request_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * `admin_tokens` (이슈 #47, ADR-0019): 관리 주체별 토큰.
 * - 원문 저장 금지 — SHA-256(token) hex만 저장한다. 서버는 제시된 Bearer를 해시해 조회한다.
 * - `scope`: 'questions:read' | 'questions:write' (쓰기는 읽기 포함).
 * - `revoked_at`: 개별 폐기. 교체는 폐기 + 신규 발급(#55 운영 절차).
 * - 쿠키 미사용(CSRF 비대상), 브라우저 노출 금지.
 */
export const adminTokens = sqliteTable(
  'admin_tokens',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    actor: text('actor').notNull(),
    scope: text('scope').notNull(),
    revokedAt: integer('revoked_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('admin_tokens_actor_idx').on(table.actor)],
);

/**
 * `admin_idempotency` (이슈 #47, ADR-0019): 멱등 등록 응답 재현.
 * - `key`(`Idempotency-Key` 헤더) PK. `request_hash` = SHA-256(method + path + body 원문).
 * - 동일 key + 동일 해시 → 저장된 응답 재현. 다른 해시 → 409(충돌).
 * - 응답 본문은 생성된 id 등 재현에 필요한 최소 JSON만 저장한다(토큰·payload 원문 금지).
 */
export const adminIdempotency = sqliteTable('admin_idempotency', {
  key: text('key').primaryKey(),
  requestHash: text('request_hash').notNull(),
  statusCode: integer('status_code').notNull(),
  responseBody: text('response_body').notNull(),
  createdAt: integer('created_at').notNull(),
});
