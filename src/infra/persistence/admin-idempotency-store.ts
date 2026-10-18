import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { sha256Hex } from '@/infra/auth/session/crypto';
import type { IdempotencyStore } from '@/app/admin/ports';
import { adminIdempotency } from './schema';

/**
 * D1 멱등 저장소 어댑터 (이슈 #47, ADR-0019).
 * - 요청 해시 = SHA-256(method + path + body 원문). 응답 본문은 재현용 최소 JSON만 저장한다.
 * - 토큰·payload 원문은 저장하지 않는다.
 */
export function createD1IdempotencyStore(db: D1Database): IdempotencyStore {
  const d1 = drizzle(db);

  return {
    async computeRequestHash({ method, path, bodyText }) {
      return sha256Hex(`${method}\n${path}\n${bodyText}`);
    },

    async findByKey({ key }) {
      const rows = await d1.select().from(adminIdempotency).where(eq(adminIdempotency.key, key)).limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        key: row.key,
        requestHash: row.requestHash,
        statusCode: row.statusCode,
        responseBody: row.responseBody,
        createdAt: row.createdAt,
      };
    },

    async save({ key, requestHash, statusCode, responseBody, now }) {
      await d1
        .insert(adminIdempotency)
        .values({ key, requestHash, statusCode, responseBody, createdAt: now })
        .onConflictDoNothing();
    },
  };
}
