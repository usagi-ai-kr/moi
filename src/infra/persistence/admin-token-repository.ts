import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { sha256Hex } from '@/infra/auth/session/crypto';
import type { AdminTokenRepository } from '@/app/admin/ports';
import { adminTokens } from './schema';

/**
 * D1 관리 토큰 어댑터 (이슈 #47, ADR-0019).
 * - 원문 저장 금지 — SHA-256(token) hex로만 조회한다. 제시 토큰과 저장 해시를 메모리에 올리지 않는다.
 * - 폐기된 토큰은 null(사유를 구분하지 않아 열거를 막는다).
 */
export function createD1AdminTokenRepository(db: D1Database): AdminTokenRepository {
  const d1 = drizzle(db);

  return {
    async verifyToken({ token }) {
      const tokenHash = await sha256Hex(token);
      const rows = await d1.select().from(adminTokens).where(eq(adminTokens.tokenHash, tokenHash)).limit(1);
      const row = rows[0];
      if (!row || row.revokedAt !== null) return null;
      return { actor: row.actor, scope: row.scope };
    },

    async registerToken({ token, actor, scope, now }) {
      const tokenHash = await sha256Hex(token);
      const id = crypto.randomUUID();
      await d1
        .insert(adminTokens)
        .values({ id, tokenHash, actor, scope, revokedAt: null, createdAt: now });
      return { id };
    },

    async revokeToken({ actor, now }) {
      await d1
        .update(adminTokens)
        .set({ revokedAt: now })
        .where(eq(adminTokens.actor, actor));
    },
  };
}
