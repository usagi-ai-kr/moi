import { describe, expect, it } from 'vitest';
import { authenticateSession, type AuthenticateSessionDeps } from '@/app/session/authenticate-session';
import { completeLogin, type CompleteLoginDeps } from '@/app/session/complete-login';
import { issueUserSession, type IssueUserSessionDeps } from '@/app/session/issue-user-session';
import { revokeSession, type RevokeSessionDeps } from '@/app/session/revoke-session';
import type { SessionEventLogger, SessionRepository, SessionTokenIssuer, SessionTokenVerifier } from '@/app/session/ports';
import { SESSION_TTL_SECONDS, type SessionClaims } from '@/domain/session/session';

// 이슈 #4 (ADR-0005/0006) use case 단위 테스트 — fake port로 발급/검증/폐기·
// 세션 고정 방지(매 로그인 새 jti)·fail-closed(저장 실패 시 토큰 미발급)를 검증한다.

const USER_A = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000a1';
const USER_B = '0f9f1a3e-6f1a-4c2e-8f0b-0000000000b2';

interface FakeSession {
  issuer: SessionTokenIssuer;
  issued: Array<{ userId: string; now: number; token: string; claims: SessionClaims }>;
}

function fakeIssuer(): FakeSession {
  const issued: FakeSession['issued'] = [];
  let counter = 0;
  const issuer: SessionTokenIssuer = {
    async issue({ userId, now }) {
      counter += 1;
      const claims: SessionClaims = { sub: userId, jti: `jti-${counter}`, iat: now, exp: now + SESSION_TTL_SECONDS };
      issued.push({ userId, now, token: `token-${counter}`, claims });
      return { token: `token-${counter}`, claims };
    },
  };
  return { issuer, issued };
}

interface FakeRepo {
  repository: SessionRepository;
  activated: Array<{ jti: string; userId: string; issuedAt: number; expiresAt: number }>;
  revoked: Array<{ jti: string; now: number }>;
}

function fakeRepo(options?: { active?: boolean }): FakeRepo {
  const activated: FakeRepo['activated'] = [];
  const revoked: FakeRepo['revoked'] = [];
  let active = options?.active ?? true;
  const repository: SessionRepository = {
    async activate(input) {
      activated.push(input);
    },
    async findActive({ jti }) {
      if (!active) return null;
      const record = activated.find((a) => a.jti === jti);
      return record ? { userId: record.userId, expiresAt: record.expiresAt } : null;
    },
    async revoke({ jti, now }) {
      if (!active) return false;
      active = false;
      revoked.push({ jti, now });
      return true;
    },
  };
  return { repository, activated, revoked };
}

function fakeLogger() {
  const events: string[] = [];
  const logger: SessionEventLogger = {
    info: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    warn: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    error: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
  };
  return { logger, events };
}

function issueDeps(repo: FakeRepo, issuer: FakeIssueDeps['issuer']) {
  return { tokenIssuer: issuer, sessionRepository: repo.repository, logger: fakeLogger().logger } satisfies IssueUserSessionDeps;
}
type FakeIssueDeps = ReturnType<typeof fakeIssuer>;

describe('issueUserSession use case', () => {
  it('세션 발급: 토큰+claims 발급, D1 활성화(jti·userId·issuedAt·expiresAt) 호출', async () => {
    const issuer = fakeIssuer();
    const repo = fakeRepo();

    const result = await issueUserSession(issueDeps(repo, issuer.issuer), { userId: USER_A, now: 1000 });

    expect(result.outcome).toBe('issued');
    if (result.outcome === 'issued') {
      expect(result.claims.sub).toBe(USER_A);
      expect(result.claims.exp - result.claims.iat).toBe(SESSION_TTL_SECONDS);
      expect(repo.activated).toEqual([
        { jti: result.claims.jti, userId: USER_A, issuedAt: 1000, expiresAt: 1000 + SESSION_TTL_SECONDS },
      ]);
    }
  });

  it('매 로그인 새 jti/토큰(세션 고정 방지)', async () => {
    const issuer = fakeIssuer();
    const repo = fakeRepo();
    const deps = issueDeps(repo, issuer.issuer);

    const first = await issueUserSession(deps, { userId: USER_A, now: 1000 });
    const second = await issueUserSession(deps, { userId: USER_A, now: 2000 });

    expect(first.outcome).toBe('issued');
    expect(second.outcome).toBe('issued');
    if (first.outcome === 'issued' && second.outcome === 'issued') {
      expect(first.claims.jti).not.toBe(second.claims.jti);
      expect(first.token).not.toBe(second.token);
    }
  });

  it('내부 UUID가 아닌 userId는 발급을 거부한다', async () => {
    const issuer = fakeIssuer();
    const repo = fakeRepo();

    const result = await issueUserSession(issueDeps(repo, issuer.issuer), { userId: 'not-a-uuid', now: 1000 });

    expect(result.outcome).toBe('rejected');
    expect(issuer.issued).toHaveLength(0);
    expect(repo.activated).toHaveLength(0);
  });

  it('fail-closed: D1 활성화 실패 시 토큰을 반환하지 않는다', async () => {
    const issuer = fakeIssuer();
    const failingRepo: SessionRepository = {
      async activate() {
        throw new Error('d1 down');
      },
      async findActive() {
        return null;
      },
      async revoke() {
        return false;
      },
    };
    const events: string[] = [];
    const logger: SessionEventLogger = {
      info: () => {},
      warn: () => {},
      error: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    };

    const result = await issueUserSession(
      { tokenIssuer: issuer.issuer, sessionRepository: failingRepo, logger },
      { userId: USER_A, now: 1000 },
    );

    expect(result.outcome).toBe('rejected');
    expect(events.join('\n')).not.toContain('token-1'); // 원문 토큰 유출 없음
  });

  it('발급 로그에 토큰/jti/userId 원문이 남지 않는다(결과 코드만)', async () => {
    const issuer = fakeIssuer();
    const repo = fakeRepo();
    const events: string[] = [];
    const logger: SessionEventLogger = {
      info: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      warn: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      error: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    };

    await issueUserSession({ tokenIssuer: issuer.issuer, sessionRepository: repo.repository, logger }, { userId: USER_A, now: 1000 });

    const serialized = events.join('\n');
    expect(serialized.includes('token-1')).toBe(false);
    expect(serialized.includes('jti-1')).toBe(false);
    expect(serialized.includes(USER_A)).toBe(false);
  });
});

describe('authenticateSession use case', () => {
  function verifyDeps(repo: FakeRepo, result: { outcome: 'valid'; claims: SessionClaims } | { outcome: 'invalid'; reason: string }) {
    const verifier: SessionTokenVerifier = {
      async verify() {
        return result as Awaited<ReturnType<SessionTokenVerifier['verify']>>;
      },
    };
    return { tokenVerifier: verifier, sessionRepository: repo.repository, logger: fakeLogger().logger } satisfies AuthenticateSessionDeps;
  }

  it('유효 토큰 + 활성 세션: userId를 반환한다', async () => {
    const repo = fakeRepo({ active: true });
    await repo.repository.activate({ jti: 'jti-x', userId: USER_A, issuedAt: 1000, expiresAt: 1000 + SESSION_TTL_SECONDS });

    const result = await authenticateSession(verifyDeps(repo, {
      outcome: 'valid',
      claims: { sub: USER_A, jti: 'jti-x', iat: 1000, exp: 1000 + SESSION_TTL_SECONDS },
    }), { token: 'token-x', now: 2000 });

    expect(result).toEqual({ outcome: 'authenticated', userId: USER_A, expiresAt: 1000 + SESSION_TTL_SECONDS });
  });

  it('쿠키 없음: missing_token 거부(저장소 미호출)', async () => {
    const repo = fakeRepo();

    const result = await authenticateSession(verifyDeps(repo, { outcome: 'valid', claims: { sub: USER_A, jti: 'j', iat: 1, exp: 2 } }), { token: null, now: 1000 });

    expect(result).toEqual({ outcome: 'rejected', reason: 'missing_token' });
  });

  it('변조/만료/미지 토큰: verifier 거부 → invalid_token/expired_token', async () => {
    const repo = fakeRepo();

    const tampered = await authenticateSession(verifyDeps(repo, { outcome: 'invalid', reason: 'tampered' }), { token: 't', now: 1000 });
    const expired = await authenticateSession(verifyDeps(repo, { outcome: 'invalid', reason: 'expired' }), { token: 't', now: 1000 });

    expect(tampered).toEqual({ outcome: 'rejected', reason: 'invalid_token' });
    expect(expired).toEqual({ outcome: 'rejected', reason: 'expired_token' });
  });

  it('폐기/만료된 jti(저장소 비활성): inactive_session 거부', async () => {
    const repo = fakeRepo({ active: false });

    const result = await authenticateSession(verifyDeps(repo, {
      outcome: 'valid',
      claims: { sub: USER_A, jti: 'jti-x', iat: 1000, exp: 1000 + SESSION_TTL_SECONDS },
    }), { token: 'token-x', now: 2000 });

    expect(result).toEqual({ outcome: 'rejected', reason: 'inactive_session' });
  });

  it('claims.sub와 저장소 user_id 불일치: 거부', async () => {
    const repo = fakeRepo();
    await repo.repository.activate({ jti: 'jti-x', userId: USER_B, issuedAt: 1000, expiresAt: 2000 });

    const result = await authenticateSession(verifyDeps(repo, {
      outcome: 'valid',
      claims: { sub: USER_A, jti: 'jti-x', iat: 1000, exp: 2000 },
    }), { token: 'token-x', now: 1500 });

    expect(result).toEqual({ outcome: 'rejected', reason: 'inactive_session' });
  });
});

describe('revokeSession use case', () => {
  function revokeDeps(repo: FakeRepo, verifyResult: { outcome: 'valid'; claims: SessionClaims } | { outcome: 'invalid'; reason: string }) {
    const verifier: SessionTokenVerifier = {
      async verify() {
        return verifyResult as Awaited<ReturnType<SessionTokenVerifier['verify']>>;
      },
    };
    return { tokenVerifier: verifier, sessionRepository: repo.repository, logger: fakeLogger().logger } satisfies RevokeSessionDeps;
  }

  it('활성 세션 폐기: revoke 호출 + revoked 반환', async () => {
    const repo = fakeRepo();
    await repo.repository.activate({ jti: 'jti-x', userId: USER_A, issuedAt: 1000, expiresAt: 2000 });

    const result = await revokeSession(revokeDeps(repo, {
      outcome: 'valid',
      claims: { sub: USER_A, jti: 'jti-x', iat: 1000, exp: 2000 },
    }), { token: 'token-x', now: 1500 });

    expect(result).toEqual({ outcome: 'revoked' });
    expect(repo.revoked).toEqual([{ jti: 'jti-x', now: 1500 }]);
  });

  it('쿠키 없음/변조 토큰: 거부(미인증 401 근거)', async () => {
    const repo = fakeRepo();

    const missing = await revokeSession(revokeDeps(repo, { outcome: 'valid', claims: { sub: USER_A, jti: 'j', iat: 1, exp: 2 } }), { token: null, now: 1000 });
    const invalid = await revokeSession(revokeDeps(repo, { outcome: 'invalid', reason: 'tampered' }), { token: 't', now: 1000 });

    expect(missing).toEqual({ outcome: 'rejected', reason: 'missing_token' });
    expect(invalid).toEqual({ outcome: 'rejected', reason: 'invalid_token' });
  });

  it('이미 폐기/만료된 세션: inactive_session 거부(같은 PASETO 재사용 불가)', async () => {
    const repo = fakeRepo({ active: false });

    const result = await revokeSession(revokeDeps(repo, {
      outcome: 'valid',
      claims: { sub: USER_A, jti: 'jti-x', iat: 1000, exp: 2000 },
    }), { token: 'token-x', now: 1500 });

    expect(result).toEqual({ outcome: 'rejected', reason: 'inactive_session' });
    expect(repo.revoked).toHaveLength(0);
  });
});

describe('completeLogin use case (카카오→identity→세션 합성)', () => {
  function compositeDeps(options?: {
    kakao?: { outcome: 'success'; identity: { provider: 'kakao'; sub: string } } | { outcome: 'rejected'; reason: string };
    identity?: { outcome: 'resolved'; userId: string } | { outcome: 'rejected' };
    session?: { outcome: 'issued'; token: string; claims: SessionClaims } | { outcome: 'rejected' };
  }) {
    const sessionIssued: Array<{ userId: string }> = [];
    const deps: CompleteLoginDeps = {
      completeKakaoLogin: async () => {
        const kakao = options?.kakao ?? { outcome: 'success', identity: { provider: 'kakao' as const, sub: 'kakao-sub-1' } };
        return kakao as Awaited<ReturnType<CompleteLoginDeps['completeKakaoLogin']>>;
      },
      resolveOrCreateUser: async () => {
        const identity = options?.identity ?? { outcome: 'resolved', userId: USER_A };
        return identity as Awaited<ReturnType<CompleteLoginDeps['resolveOrCreateUser']>>;
      },
      issueUserSession: async (input) => {
        sessionIssued.push({ userId: input.userId });
        const session = options?.session ?? {
          outcome: 'issued',
          token: 'session-token-raw',
          claims: { sub: input.userId, jti: 'jti-c', iat: input.now, exp: input.now + SESSION_TTL_SECONDS },
        };
        return session as Awaited<ReturnType<CompleteLoginDeps['issueUserSession']>>;
      },
      logger: fakeLogger().logger,
    };
    return { deps, sessionIssued };
  }

  it('검증 성공 → 내부 user resolve → 세션 발급', async () => {
    const { deps, sessionIssued } = compositeDeps();

    const result = await completeLogin(deps, { code: 'c', state: 's', browserBindingToken: 'b', now: 1000 });

    expect(result.outcome).toBe('success');
    if (result.outcome === 'success') {
      expect(result.userId).toBe(USER_A);
      expect(result.session.token).toBe('session-token-raw');
      expect(result.session.expiresAt).toBe(1000 + SESSION_TTL_SECONDS);
    }
    expect(sessionIssued).toEqual([{ userId: USER_A }]);
  });

  it('카카오 거부(취소/바인딩 등): 세션 발급 없이 사유 전달', async () => {
    const { deps, sessionIssued } = compositeDeps({ kakao: { outcome: 'rejected', reason: 'user_cancelled' } });

    const result = await completeLogin(deps, { state: 's', now: 1000 });

    expect(result).toEqual({ outcome: 'rejected', reason: 'user_cancelled' });
    expect(sessionIssued).toHaveLength(0);
  });

  it('identity resolve 거부: identity_resolve_failed, 세션 미발급', async () => {
    const { deps, sessionIssued } = compositeDeps({ identity: { outcome: 'rejected' } });

    const result = await completeLogin(deps, { code: 'c', state: 's', browserBindingToken: 'b', now: 1000 });

    expect(result).toEqual({ outcome: 'rejected', reason: 'identity_resolve_failed' });
    expect(sessionIssued).toHaveLength(0);
  });

  it('세션 발급 거부: session_issue_failed', async () => {
    const { deps, sessionIssued } = compositeDeps({ session: { outcome: 'rejected' } });

    const result = await completeLogin(deps, { code: 'c', state: 's', browserBindingToken: 'b', now: 1000 });

    expect(result).toEqual({ outcome: 'rejected', reason: 'session_issue_failed' });
    expect(sessionIssued).toHaveLength(1); // 시도는 했으나 토큰은 반환되지 않음
  });

  it('세션 실패 경로에도 sub/토큰 원문 미노출 로그', async () => {
    const events: string[] = [];
    const kakao = fakeIssuer();
    const repo = fakeRepo();
    const logger: SessionEventLogger = {
      info: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      warn: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      error: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    };
    const deps: CompleteLoginDeps = {
      completeKakaoLogin: async () => ({ outcome: 'success', identity: { provider: 'kakao', sub: 'kakao-sub-1' } }),
      resolveOrCreateUser: async () => ({ outcome: 'resolved', userId: USER_A }),
      issueUserSession: () => issueUserSession({ tokenIssuer: kakao.issuer, sessionRepository: repo.repository, logger }, { userId: USER_A, now: 1000 }),
      logger,
    };
    // 발급 실패 유도: D1 활성화 실패
    const failingRepo: SessionRepository = { async activate() { throw new Error('down'); }, async findActive() { return null; }, async revoke() { return false; } };

    const result = await completeLogin({ ...deps, issueUserSession: () => issueUserSession({ tokenIssuer: kakao.issuer, sessionRepository: failingRepo, logger }, { userId: USER_A, now: 1000 }) }, { code: 'c', state: 's', browserBindingToken: 'b', now: 1000 });

    expect(result).toEqual({ outcome: 'rejected', reason: 'session_issue_failed' });
    expect(events.join('\n')).not.toContain('token-1');
    expect(events.join('\n')).not.toContain('kakao-sub-1');
  });
});

describe('로그 계약(whitelist) — SessionEventLogger', () => {
  it('level/msg/outcome 외 필드는 전달 불가', () => {
    const events: string[] = [];
    const logger: SessionEventLogger = {
      info: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      warn: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
      error: (msg, outcome) => events.push(JSON.stringify({ msg, outcome })),
    };
    logger.info('session_issued', 'issued');
    expect(JSON.parse(events[0])).toEqual({ msg: 'session_issued', outcome: 'issued' });
  });
});
