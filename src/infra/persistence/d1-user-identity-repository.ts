import { and, eq, notExists } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { UserIdentityRepository } from '@/app/identity/ports';
import { isValidUserId } from '@/domain/identity/user';
import { toExternalIdentity, toUser } from './identity-mapper';
import { externalIdentities, users } from './schema';
/**
 * D1 `users`/`external_identities` 어댑터 (이슈 #3, ADR-0004).
 *
 * 동시 최초 로그인 원자적 처리:
 * 1. 새 user insert + identity `INSERT ... ON CONFLICT DO NOTHING`을 **D1 batch(단일 원자적 호출)**로 실행.
 * 2. 승리(returning rows 존재) → 내 userId 반환.
 * 3. 패배 → 승자 identity 재조회로 수렴 + **내가 방금 만든 고아 user만** 조건부 삭제
 *    (`id = 내 id AND NOT EXISTS identity 연결`) — 기존 user row는 절대 삭제하지 않는다.
 */
export function createD1UserIdentityRepository(db: D1Database): UserIdentityRepository {
  const d1 = drizzle(db);

  return {
    async resolveOrCreate({ provider, subject, now }) {
      const myUserId = crypto.randomUUID();
      const [userInsertResult, identityInsertResult] = await d1.batch([
        d1.insert(users).values({ id: myUserId, createdAt: now, updatedAt: now }),
        d1
          .insert(externalIdentities)
          .values({
            id: crypto.randomUUID(),
            provider,
            providerSubject: subject,
            userId: myUserId,
            createdAt: now,
          })
          .onConflictDoNothing({
            target: [externalIdentities.provider, externalIdentities.providerSubject],
          })
          .returning({ userId: externalIdentities.userId }),
      ]);
      void userInsertResult;

      const inserted = identityInsertResult;
      if (inserted.length > 0) {
        return { userId: inserted[0].userId };
      }

      // 패배: 승자 identity로 수렴한다
      const winners = await d1
        .select({ userId: externalIdentities.userId })
        .from(externalIdentities)
        .where(and(eq(externalIdentities.provider, provider), eq(externalIdentities.providerSubject, subject)))
        .limit(1);
      const winner = winners[0];
      if (winner === undefined || !isValidUserId(winner.userId)) {
        throw new Error('identity: winner identity missing after conflict');
      }

      // 보상: 내가 만든 user 중 identity가 연결되지 않은 것만 조건부 삭제(고아 신규 user 0건 보장).
      // 기존 user row는 이 조건(id = 내 방금 생성 id)에 해당하지 않아 삭제되지 않는다.
      await d1
        .delete(users)
        .where(
          and(
            eq(users.id, myUserId),
            notExists(
              d1
                .select({ linkedUserId: externalIdentities.userId })
                .from(externalIdentities)
                .where(eq(externalIdentities.userId, myUserId)),
            ),
          ),
        );

      return { userId: winner.userId };
    },

    async findIdentity({ provider, subject }) {
      const rows = await d1
        .select()
        .from(externalIdentities)
        .where(and(eq(externalIdentities.provider, provider), eq(externalIdentities.providerSubject, subject)))
        .limit(1);
      return rows[0] !== undefined ? toExternalIdentity(rows[0]) : null;
    },

    async findUser({ userId }) {
      const rows = await d1.select().from(users).where(eq(users.id, userId)).limit(1);
      return rows[0] !== undefined ? toUser(rows[0]) : null;
    },
  };
}
