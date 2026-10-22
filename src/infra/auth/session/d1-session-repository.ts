import { drizzle } from 'drizzle-orm/d1';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { SessionRepository } from '@/app/session/ports';
import { sha256Hex } from './crypto';
import { sessions } from '@/infra/persistence/schema';

/**
 * D1 `sessions` 어댑터 (이슈 #4, ADR-0005 / 이슈 #52 단일 활성 세션).
 * - Port는 원문 jti를 받고 어댑터가 SHA-256 hex로 해시해 저장한다(PASETO/jti 원문 저장 금지).
 * - `activate`: 같은 사용자의 기존 활성 세션을 폐기한 뒤 새 jti를 활성화한다.
 *   D1 `batch`는 원자적 쓰기 단위라 경합 시에도 착지 상태는 활성 1개이며,
 *   부분 UNIQUE(`sessions_user_active_uq`)가 최후 방어선이 된다(충돌 시 배치 전체 롤백 → 발급 거부, fail-closed).
 * - `findActive`: `jti_hash = ? AND revoked_at IS NULL AND expires_at > now`.
 * - `revoke`: 조건부 단일 UPDATE(`revoked_at IS NULL`)로 1회 폐기 — 재사용 불가(fail-closed).
 */
export function createD1SessionRepository(db: D1Database): SessionRepository {
  const d1 = drizzle(db);
  return {
    async activate({ jti, userId, issuedAt, expiresAt }) {
      const jtiHash = await sha256Hex(jti);
      await d1.batch([
        d1
          .update(sessions)
          .set({ revokedAt: issuedAt })
          .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt))),
        d1.insert(sessions).values({ jtiHash, userId, issuedAt, expiresAt, revokedAt: null }),
      ]);
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
