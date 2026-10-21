import type { ResolveOrCreateUserDeps } from '@/app/identity/resolve-or-create-user';
import type { AuthenticateSessionDeps } from '@/app/session/authenticate-session';
import type { GetAccountInfoDeps } from '@/app/session/get-account-info';
import type { IssueUserSessionDeps } from '@/app/session/issue-user-session';
import type { RevokeSessionDeps } from '@/app/session/revoke-session';
import type { SessionEventLogger } from '@/app/session/ports';
import { createJsonLogger } from '@/infra/logging/json-logger';
import { createD1AccountRepository } from '@/infra/persistence/d1-account-repository';
import { createD1UserIdentityRepository } from '@/infra/persistence/d1-user-identity-repository';
import { createD1SessionRepository } from './d1-session-repository';
import { createPasetoKeyring } from './keyring';
import { createPasetoSessionTokenAdapter } from './paseto-token-adapter';

/** 세션 단위 환경 바인딩(테스트 주입 대응 — Env 부분집합). */
export interface SessionEnv {
  readonly DB: D1Database;
  readonly PASETO_KEY_V1: string;
  readonly PASETO_KEY_V2?: string;
}

/** 요청 단위 세션 포트 어댑터 조립(테스트에서는 스파이로 교체 가능). */
export interface SessionRuntime {
  readonly issue: IssueUserSessionDeps;
  readonly authenticate: AuthenticateSessionDeps;
  readonly revoke: RevokeSessionDeps;
  /** 카카오 identity → 내부 user resolve (#3 use case deps). */
  readonly resolveIdentity: ResolveOrCreateUserDeps;
  /** 계정 정보(가입일·최근 로그인) 조회 — 읽기 전용(#234/ADR-0072). */
  readonly account: GetAccountInfoDeps;
  readonly logger: SessionEventLogger;
}

export function createSessionRuntime(env: SessionEnv, requestId: string): SessionRuntime {
  const logger = createJsonLogger(requestId);
  const keyring = createPasetoKeyring(env);
  if (keyring.verifyKeys.length === 0) {
    // 키 미설정/형식 오류 — 500이 아니라 모든 발급·검증이 거부되는 fail-closed로 동작한다.
    logger.error('session_runtime_misconfigured', 'paseto_key_missing');
  }
  const tokenAdapter = createPasetoSessionTokenAdapter(keyring);
  const sessionRepo = createD1SessionRepository(env.DB);
  const identityRepo = createD1UserIdentityRepository(env.DB);
  const accountRepo = createD1AccountRepository(env.DB);

  return {
    issue: { tokenIssuer: tokenAdapter, sessionRepository: sessionRepo, logger },
    authenticate: { tokenVerifier: tokenAdapter, sessionRepository: sessionRepo, logger },
    revoke: { tokenVerifier: tokenAdapter, sessionRepository: sessionRepo, logger },
    resolveIdentity: { repository: identityRepo, logger },
    account: { accountRepository: accountRepo },
    logger,
  };
}
