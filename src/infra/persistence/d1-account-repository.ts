import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { AccountInfoRepository } from '@/app/session/ports';
import { sessions, users } from './schema';

/**
 * D1 `users`/`sessions` 계정 정보 어댑터 (이슈 #234, ADR-0072).
 * - 가입일 = `users.created_at`(epoch seconds) — 회원가입 시점에 쓰인 값.
 * - 최근 로그인 = `MAX(sessions.issued_at)` — 세션 발급(=인증 성공) 시각의 최댓값.
 *   폐기된 세션 행도 이력으로 남으므로(logout·재로그인 모두 유지) 최댓값이 마지막 로그인이다.
 * - **읽기 전용** — 쓰기·마이그레이션 0건. 계정 정보는 파생해서 보여준다.
 */
export function createD1AccountRepository(db: D1Database): AccountInfoRepository {
  const d1 = drizzle(db);

  return {
    async findAccountInfo({ userId }) {
      const userRows = await d1
        .select({ createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const user = userRows[0];
      if (user === undefined) return null;

      const lastLoginRows = await d1
        .select({ issuedAt: sql<number | null>`max(${sessions.issuedAt})` })
        .from(sessions)
        .where(eq(sessions.userId, userId));
      return { createdAt: user.createdAt, lastLoginAt: lastLoginRows[0]?.issuedAt ?? null };
    },
  };
}
