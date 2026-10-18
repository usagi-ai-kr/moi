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

// 0.1.3(#4)에서 sessions를 추가한다.
