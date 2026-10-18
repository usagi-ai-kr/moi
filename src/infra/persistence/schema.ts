import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/** infra(persistence) 전용 — domain/app은 참조 금지(ADR-0001). `oauth_states`(#2/ADR-0003): state_hash PK, 해시만 저장, 1회 소비, epoch seconds. */
export const oauthStates = sqliteTable('oauth_states', {
  stateHash: text('state_hash').primaryKey(),
  browserBindingHash: text('browser_binding_hash').notNull(),
  nonce: text('nonce').notNull(),
  pkceVerifier: text('pkce_verifier').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
});

/** `users`(#3/ADR-0004): 내부 사용자 UUID PK. 이메일/닉네임 컬럼 없음. */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** `external_identities`(#3/ADR-0004): UNIQUE(provider, subject) 경합 승부처, user_id 역방향 INDEX. */
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

/** `sessions`(#4/ADR-0005): jti_hash PK(원문 금지), user_id FK, revoked_at 즉시 폐기. */
export const sessions = sqliteTable('sessions', {
  jtiHash: text('jti_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  issuedAt: integer('issued_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
});

/** `exams`(#46/ADR-0019): 시험 독립 구조 최상위, code UNIQUE. */
export const exams = sqliteTable('exams', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** `exam_domains`(#46/ADR-0019): UNIQUE(exam_id, code), weight 정수 percent. */
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

/** `questions`(#46/ADR-0019): status active|inactive(풀이 이력 물리 삭제 금지), current_version_no. */
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

/** `question_versions`(#46/ADR-0019): UNIQUE(question_id, version_no), 정답 JSON(부분집합 검증), hash/review 상태. */
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

/** `question_options`(#46/ADR-0019): UNIQUE(version_id, option_key). */
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

/** `audit_logs`(#46/ADR-0019): actor/action/대상/요청 id만. 원문 저장 금지(ADR-0006). */
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  requestId: text('request_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** `admin_tokens`(#47/ADR-0019): token_hash UNIQUE(원문 금지), scope read/write, revoked_at 개별 폐기. */
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

/** `admin_idempotency`(#47/ADR-0019): key PK, request_hash로 재현/409 판정. 원문 저장 금지. */
export const adminIdempotency = sqliteTable('admin_idempotency', {
  key: text('key').primaryKey(),
  requestHash: text('request_hash').notNull(),
  statusCode: integer('status_code').notNull(),
  responseBody: text('response_body').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** `study_sets`(#49/ADR-0020): 부분 UNIQUE(user_id, exam_id WHERE active), result_json은 submitted만. */
export const studySets = sqliteTable(
  'study_sets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    examId: text('exam_id').notNull(),
    mode: text('mode').notNull(),
    domainId: text('domain_id'),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    submittedAt: integer('submitted_at'),
    resultJson: text('result_json', { mode: 'json' }).$type<StudySetResultJson | null>(),
  },
  (table) => [
    uniqueIndex('study_sets_user_exam_active_uq')
      .on(table.userId, table.examId)
      .where(sql`status = 'active'`),
    index('study_sets_user_idx').on(table.userId),
  ],
);

interface StudySetResultJson {
  readonly answeredCount: number;
  readonly correctCount: number;
  readonly accuracyPercent: number;
  readonly passCount: number;
  readonly unansweredCount: number;
  readonly perItem: ReadonlyArray<{
    readonly questionId: string;
    readonly responseKind: string;
    readonly selectedOptionIds: readonly string[];
    readonly correctOptionIds: readonly string[] | null;
    readonly correct: boolean;
  }>;
}

/** `study_set_items`(#49/ADR-0020, #50 내용 스냅샷): PK(set_id, question_id), 정답 스냅샷이 채점 기준. */
export const studySetItems = sqliteTable(
  'study_set_items',
  {
    setId: text('set_id')
      .notNull()
      .references(() => studySets.id),
    questionId: text('question_id').notNull(),
    questionVersionId: text('question_version_id').notNull(),
    versionNo: integer('version_no').notNull(),
    optionOrder: text('option_order', { mode: 'json' }).$type<string[]>().notNull(),
    answerOptionIds: text('answer_option_ids', { mode: 'json' }).$type<string[]>().notNull(),
    /** 시작 시점 문제 본문 스냅샷 — 제출 전 DTO에 노출한다(#50). */
    stem: text('stem').notNull().default(''),
    /** 시작 시점 보기 텍스트 스냅샷 — 제출 전 DTO에 노출한다(#50). */
    options: text('options_json', { mode: 'json' }).$type<Array<{ optionId: string; text: string }>>().notNull().default([]),
    /** 시작 시점 해설 스냅샷 — 제출 후에만 노출한다(#50). */
    explanation: text('explanation').notNull().default(''),
    /** 시작 시점 근거 URL 스냅샷 — 제출 후에만 노출한다(#50). */
    sourceUrls: text('source_urls', { mode: 'json' }).$type<string[]>().notNull().default([]),
    responseKind: text('response_kind').notNull().default('unanswered'),
    selectedOptionIds: text('selected_option_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  },
  (table) => [
    primaryKey({ columns: [table.setId, table.questionId] }),
    index('study_set_items_set_idx').on(table.setId),
  ],
);
