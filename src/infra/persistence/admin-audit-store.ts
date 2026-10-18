import { desc, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { toAuditLog } from './question-mapper';
import { auditLogs } from './schema';
import type { AdminAuditStore } from '@/app/admin/ports';

/**
 * 감사 조회 어댑터 (이슈 #47, ADR-0019).
 * - limit/offset 페이지네이션. 토큰·payload 원문은 저장하지 않으므로 읽을 수도 없다.
 */
export function createD1AdminAuditStore(db: D1Database): AdminAuditStore {
  const d1 = drizzle(db);

  return {
    async list({ limit, offset }) {
      const capped = Math.min(Math.max(limit, 1), 200);
      const skipped = Math.max(offset, 0);
      const rows = await d1
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(capped)
        .offset(skipped);
      const [{ count }] = await d1
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs);
      return { items: rows.map(toAuditLog), total: count };
    },
  };
}
