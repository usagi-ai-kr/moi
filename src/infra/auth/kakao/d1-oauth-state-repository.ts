import { and, eq, gt, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { OAuthStateRepository } from '@/app/auth/ports';
import { oauthStates } from '@/infra/persistence/schema';

/**
 * D1 `oauth_states` 어댑터 (ADR-0003/0004).
 * `consume`은 state_hash 기준 조건부 단일 UPDATE(`consumed_at IS NULL AND expires_at > now`)
 * + RETURNING으로 1회 소비를 보장한다 — 동시 콜백에서 한 요청만 승리(fail-closed).
 */
export function createD1OAuthStateRepository(db: D1Database): OAuthStateRepository {
  const d1 = drizzle(db);
  return {
    async create({ record, expiresAt, now }) {
      await d1.insert(oauthStates).values({
        stateHash: record.stateHash,
        browserBindingHash: record.browserBindingHash,
        nonce: record.nonce,
        pkceVerifier: record.pkceVerifier,
        createdAt: now,
        expiresAt,
        consumedAt: null,
      });
    },
    async consume({ stateHash, now }) {
      const rows = await d1
        .update(oauthStates)
        .set({ consumedAt: now })
        .where(
          and(
            eq(oauthStates.stateHash, stateHash),
            isNull(oauthStates.consumedAt),
            gt(oauthStates.expiresAt, now),
          ),
        )
        .returning({
          stateHash: oauthStates.stateHash,
          browserBindingHash: oauthStates.browserBindingHash,
          nonce: oauthStates.nonce,
          pkceVerifier: oauthStates.pkceVerifier,
        });
      return rows[0] ?? null;
    },
  };
}
