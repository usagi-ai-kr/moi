import { describe, expect, it } from 'vitest';
import type { IdentityEventLogger, UserIdentityRepository } from '@/app/identity/ports';
import { resolveOrCreateUser } from '@/app/identity/resolve-or-create-user';

// 이슈 #3 (ADR-0004) use case 단위 테스트 — fake port로 최초/재로그인/서로 다른 sub·
// 불변식(provider 허용 목록, 비어 있지 않은 subject)·원문 미로그를 검증한다.

function fakeRepo() {
  const calls: Array<{ provider: string; subject: string; now: number }> = [];
  const byPair = new Map<string, string>();
  let counter = 0;
  const repository: UserIdentityRepository = {
    async resolveOrCreate(input) {
      calls.push(input);
      const key = `${input.provider}:${input.subject}`;
      let id = byPair.get(key);
      if (id === undefined) {
        counter += 1;
        id = `user-${counter}`;
        byPair.set(key, id);
      }
      return { userId: id };
    },
    async findIdentity() {
      return null;
    },
    async findUser() {
      return null;
    },
  };
  return { repository, calls };
}

function fakeLogger() {
  const events: string[] = [];
  const logger: IdentityEventLogger = {
    info: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    warn: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    error: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
  };
  return { logger, events };
}

describe('ResolveOrCreateUser use case (fake port)', () => {
  it('최초 로그인: 새 내부 user_id를 반환한다', async () => {
    const repo = fakeRepo();
    const log = fakeLogger();

    const result = await resolveOrCreateUser(
      { repository: repo.repository, logger: log.logger },
      { provider: 'kakao', subject: '1234567890', now: 1000 },
    );

    expect(result).toEqual({ outcome: 'resolved', userId: 'user-1' });
    expect(repo.calls).toEqual([{ provider: 'kakao', subject: '1234567890', now: 1000 }]);
  });

  it('재로그인(동일 sub): 기존 user_id를 유지하고 새 user_id를 만들지 않는다', async () => {
    const repo = fakeRepo();
    const log = fakeLogger();
    const deps = { repository: repo.repository, logger: log.logger };

    const first = await resolveOrCreateUser(deps, { provider: 'kakao', subject: '1234567890', now: 1000 });
    const second = await resolveOrCreateUser(deps, { provider: 'kakao', subject: '1234567890', now: 2000 });

    expect(first).toEqual({ outcome: 'resolved', userId: 'user-1' });
    expect(second).toEqual({ outcome: 'resolved', userId: 'user-1' });
  });

  it('서로 다른 sub: 서로 다른 user_id를 만든다', async () => {
    const repo = fakeRepo();
    const log = fakeLogger();
    const deps = { repository: repo.repository, logger: log.logger };

    const a = await resolveOrCreateUser(deps, { provider: 'kakao', subject: '111', now: 1000 });
    const b = await resolveOrCreateUser(deps, { provider: 'kakao', subject: '222', now: 1000 });

    if (a.outcome === 'resolved' && b.outcome === 'resolved') {
      expect(a.userId).not.toBe(b.userId);
    } else {
      expect.unreachable('both should resolve');
    }
  });

  it('불변식: 허용되지 않은 provider는 저장소 호출 전에 거부한다', async () => {
    const repo = fakeRepo();
    const log = fakeLogger();

    const result = await resolveOrCreateUser(
      { repository: repo.repository, logger: log.logger },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { provider: 'github' as any, subject: '1234567890', now: 1000 },
    );

    expect(result.outcome).toBe('rejected');
    expect(repo.calls).toHaveLength(0);
  });

  it('불변식: 비어 있는 subject는 저장소 호출 전에 거부한다', async () => {
    const repo = fakeRepo();
    const log = fakeLogger();

    const result = await resolveOrCreateUser(
      { repository: repo.repository, logger: log.logger },
      { provider: 'kakao', subject: '', now: 1000 },
    );

    expect(result.outcome).toBe('rejected');
    expect(repo.calls).toHaveLength(0);
  });

  it('subject 원문은 로그에 남지 않는다(ADR-0006)', async () => {
    const repo = fakeRepo();
    const log = fakeLogger();

    await resolveOrCreateUser(
      { repository: repo.repository, logger: log.logger },
      { provider: 'kakao', subject: '1234567890', now: 1000 },
    );

    expect(log.events.join('\n').includes('1234567890')).toBe(false);
  });
});
