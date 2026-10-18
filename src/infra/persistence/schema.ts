import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

// 0.1.2(#3)에서 users/external_identities, 0.1.3(#4)에서 sessions를 추가한다.
