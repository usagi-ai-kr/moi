import type { ExternalAuthProvider, ExternalIdentity, User } from '@/domain/identity/user';
import type { externalIdentities, users } from './schema';

/**
 * Drizzle 행 → domain 타입 변환 mapper (ADR-0001/0004).
 * domain은 Drizzle 스키마 타입을 직접 참조하지 않는다 — 이 모듈만 두 계층 사이를 연결한다.
 */

type UserRow = typeof users.$inferSelect;
type ExternalIdentityRow = typeof externalIdentities.$inferSelect;

export function toUser(row: UserRow): User {
  return { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export function toExternalIdentity(row: ExternalIdentityRow): ExternalIdentity {
  return {
    provider: row.provider as ExternalAuthProvider,
    providerSubject: row.providerSubject,
    userId: row.userId,
    createdAt: row.createdAt,
  };
}
