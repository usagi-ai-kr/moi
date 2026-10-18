import { drizzle } from 'drizzle-orm/d1';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { SessionRepository } from '@/app/session/ports';
import { sha256Hex } from './crypto';
import { sessions } from '@/infra/persistence/schema';

/**
 * D1 `sessions` 어댑터 (이슈 #4, ADR-0005).
 * - Port는 원문 jti를 받고 어댑터가 SHA-256 hex로 해시해 저장한다(PASETO/jti 원문 저장 금지).
 * - `findActive`: `jti_hash = ? AND revoked_at IS NULL AND expires_at > now`.
 * - `revoke`: 조건부 단일 UPDATE(`revoked_at IS NULL`)로 1회 폐기 — 재사용 불가(fail-closed).
 */
export function createD1SessionRepository(db: D1Database): SessionRepository {
  const d1 = drizzle(db);
  return {
    async activate({ jti, userId, issuedAt, expiresAt }) {
      const jtiHash = await sha256Hex(jti);
      await d1.insert(sessions).values({ jtiHash, userId, issuedAt, expiresAt, revokedAt: null });
    },

    async findActive({ jti, now }) {
      const jtiHash = await sha256Hex(jti);
      const rows = await d1
        .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(and(eq(sessions.jtiHash, jtiHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
        .limit(1);
      return rows[0] ?? null;
    },

    async revoke({ jti, now }) {
      const jtiHash = await sha256Hex(jti);
      const rows = await d1
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.jtiHash, jtiHash), isNull(sessions.revokedAt)))
        .returning({ jtiHash: sessions.jtiHash });
      return rows.length > 0;
    },
  };
}
