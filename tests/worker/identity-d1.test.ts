import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ExternalAuthProvider } from '@/domain/identity/user';
import { createD1UserIdentityRepository } from '@/infra/persistence/d1-user-identity-repository';
import migration0000 from '../../drizzle/migrations/0000_add-oauth-states.sql?raw';
import migration0001 from '../../drizzle/migrations/0001_add-users-external-identities.sql?raw';
import { applyD1Migrations } from './fixtures/kakao-fakes';

// 이슈 #3 (ADR-0004) Worker+D1 통합 테스트 — 실제 마이그레이션·FK/UNIQUE·mapper·
// 동시성(Promise.all 동일 sub → identity 1건·고아 user 0건·동일 userId)을 증명한다.

const db = env.DB;
const repository = createD1UserIdentityRepository(db);

/** 시드용 유효 UUID(ADR-0004 내부 id 불변식 충족) — 결정적 고정값. */
const winnerUserId = '0f9f1a3e-6f1a-4c2e-8f0b-000000000001';
const winnerIdentityId = '0f9f1a3e-6f1a-4c2e-8f0b-000000000002';
const keepUser1 = '0f9f1a3e-6f1a-4c2e-8f0b-000000000003';
const keepUser2 = '0f9f1a3e-6f1a-4c2e-8f0b-000000000004';
const keepIdentityId = '0f9f1a3e-6f1a-4c2e-8f0b-000000000005';

beforeAll(async () => {
  await applyD1Migrations(db, [migration0000, migration0001]);
  // FK 강제는 production D1 기본값 — 테스트 저장소에서도 명시 켠다(미지원 환경 무시).
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma 미지원 시 FK 테스트가 실제 강제 여부를 드러낸다.
  }
});

beforeEach(async () => {
  await db.prepare('DELETE FROM external_identities').run();
  await db.prepare('DELETE FROM users').run();
});

async function count(table: 'users' | 'external_identities'): Promise<number> {
  const row = await db.prepare(`SELECT count(*) AS c FROM ${table}`).first<{ c: number }>();
  return row?.c ?? 0;
}

describe('스키마 계약 (users/external_identities)', () => {
  it('FK/UNIQUE/INDEX가 마이그레이션으로 만들어진다', async () => {
    const indexes = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'external_identities' AND name IS NOT NULL",
      )
      .all<{ name: string }>();
    const names = indexes.results.map((r) => r.name).join(',');
    expect(names).toContain('external_identities_provider_subject_uq');
    expect(names).toContain('external_identities_user_id_idx');
  });

  it('FK: 존재하지 않는 user_id를 참조하는 identity는 거부한다', async () => {
    const insert = db
      .prepare(
        "INSERT INTO external_identities (id, provider, provider_subject, user_id, created_at) VALUES ('e1', 'kakao', '999', 'missing-user', 1)",
      )
      .run();
    await expect(insert).rejects.toThrow();
  });

  it('UNIQUE(provider, provider_subject): 중복 매핑은 거부한다', async () => {
    await db
      .prepare("INSERT INTO users (id, created_at, updated_at) VALUES ('u1', 1, 1)")
      .run();
    await db
      .prepare(
        "INSERT INTO external_identities (id, provider, provider_subject, user_id, created_at) VALUES ('e1', 'kakao', '42', 'u1', 1)",
      )
      .run();
    const dup = db
      .prepare(
        "INSERT INTO external_identities (id, provider, provider_subject, user_id, created_at) VALUES ('e2', 'kakao', '42', 'u1', 2)",
      )
      .run();
    await expect(dup).rejects.toThrow();
  });
});

describe('resolveOrCreate (D1 어댑터)', () => {
  it('AC-최초: 새 내부 user_id를 만들고 user+identity를 남긴다', async () => {
    const result = await repository.resolveOrCreate({ provider: 'kakao', subject: '100', now: 1000 });

    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await count('users')).toBe(1);
    expect(await count('external_identities')).toBe(1);
    const identity = await repository.findIdentity({ provider: 'kakao', subject: '100' });
    expect(identity).toEqual({
      provider: 'kakao',
      providerSubject: '100',
      userId: result.userId,
      createdAt: 1000,
    });
    const user = await repository.findUser({ userId: result.userId });
    expect(user).toEqual({ id: result.userId, createdAt: 1000, updatedAt: 1000 });
  });

  it('AC-재로그인: 동일 sub은 기존 user_id를 유지하고 행을 추가하지 않는다', async () => {
    const first = await repository.resolveOrCreate({ provider: 'kakao', subject: '200', now: 1000 });
    const second = await repository.resolveOrCreate({ provider: 'kakao', subject: '200', now: 2000 });

    expect(second.userId).toBe(first.userId);
    expect(await count('users')).toBe(1);
    expect(await count('external_identities')).toBe(1);
  });

  it('AC-서로 다른 sub: 서로 다른 user_id를 만든다', async () => {
    const a = await repository.resolveOrCreate({ provider: 'kakao', subject: '300', now: 1000 });
    const b = await repository.resolveOrCreate({ provider: 'kakao', subject: '301', now: 1000 });

    expect(a.userId).not.toBe(b.userId);
    expect(await count('users')).toBe(2);
    expect(await count('external_identities')).toBe(2);
  });
});

describe('동시성 (동시 최초 로그인 — ADR-0004)', () => {
  it('Promise.all 동일 sub 동시 요청: identity 1건·고아 user 0건·모두 같은 userId', async () => {
    for (let i = 0; i < 5; i += 1) {
      await db.prepare('DELETE FROM external_identities').run();
      await db.prepare('DELETE FROM users').run();
      const subject = `race-${i}`;

      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          repository.resolveOrCreate({ provider: 'kakao' as ExternalAuthProvider, subject, now: 1000 + i }),
        ),
      );

      const userIds = new Set(results.map((r) => r.userId));
      expect(userIds.size).toBe(1); // 모두 같은 userId로 수렴
      expect(await count('external_identities')).toBe(1); // 매핑 1건
      expect(await count('users')).toBe(1); // 고아 신규 user 0건
      const identity = await repository.findIdentity({ provider: 'kakao', subject });
      expect(identity?.userId).toBe(results[0].userId);
    }
  });

  it('보상: 경합 패배 요청이 만든 고아 user만 조건부 삭제된다 — 승자 identity 연결 user는 절대 삭제되지 않는다', async () => {
    // 기존 사용자 W(UUID 형식)가 (kakao, '400') 매핑을 이미 보유
    await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, 1, 1)').bind(winnerUserId).run();
    await db
      .prepare(
        'INSERT INTO external_identities (id, provider, provider_subject, user_id, created_at) VALUES (?1, ?2, ?3, ?4, 1)',
      )
      .bind(winnerIdentityId, 'kakao', '400', winnerUserId)
      .run();
    const before = await count('users');

    // 동일 sub 재진입 → 패배 시뮬레이션: 내 새 user는 만들어지지만 identity는 UNIQUE로 패배 →
    // 고아(user M)만 조건부 삭제되고 승자 W로 수렴한다
    const result = await repository.resolveOrCreate({ provider: 'kakao', subject: '400', now: 3000 });

    expect(result.userId).toBe(winnerUserId); // 기존 user_id 유지
    expect(await count('users')).toBe(before); // 고아 제거로 총량 불변(기존 user 삭제 아님)
    const w = await db.prepare('SELECT id FROM users WHERE id = ?1').bind(winnerUserId).first<{ id: string }>();
    expect(w?.id).toBe(winnerUserId); // 기존 user row 삭제 금지 준수
    expect(await count('external_identities')).toBe(1);
  });

  it('기존 user row는 resolveOrCreate 유무와 무관하게 절대 삭제되지 않는다', async () => {
    await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, 1, 1)').bind(keepUser1).run();
    await db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?1, 1, 1)').bind(keepUser2).run();
    await db
      .prepare(
        'INSERT INTO external_identities (id, provider, provider_subject, user_id, created_at) VALUES (?1, ?2, ?3, ?4, 1)',
      )
      .bind(keepIdentityId, 'kakao', '500', keepUser1)
      .run();

    await repository.resolveOrCreate({ provider: 'kakao', subject: '500', now: 1000 }); // keep-1 수렴
    await repository.resolveOrCreate({ provider: 'kakao', subject: '501', now: 1000 }); // 새 user

    const keep1 = await db.prepare('SELECT id FROM users WHERE id = ?1').bind(keepUser1).first();
    const keep2 = await db.prepare('SELECT id FROM users WHERE id = ?1').bind(keepUser2).first();
    expect(keep1).not.toBeNull();
    expect(keep2).not.toBeNull();
    expect(await count('users')).toBe(3); // keep-1, keep-2, 새 user
  });
});
