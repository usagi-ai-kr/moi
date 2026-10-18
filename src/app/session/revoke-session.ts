import type { SessionEventLogger, SessionRepository, SessionTokenVerifier } from './ports';

/**
 * 세션 폐기 use case (이슈 #4, ADR-0005) — POST /auth/logout.
 * 폐기 실패(변조·만료·이미 폐기·미존재)는 모두 거부로 반환해 401의 근거가 된다.
 */

export interface RevokeSessionDeps {
  readonly tokenVerifier: SessionTokenVerifier;
  readonly sessionRepository: SessionRepository;
  readonly logger: SessionEventLogger;
}

export interface RevokeSessionInput {
  readonly token?: string | null;
  readonly now: number;
}

export type RevokeSessionResult =
  | { readonly outcome: 'revoked' }
  | { readonly outcome: 'rejected'; readonly reason: 'missing_token' | 'invalid_token' | 'inactive_session' };

export async function revokeSession(deps: RevokeSessionDeps, input: RevokeSessionInput): Promise<RevokeSessionResult> {
  const { tokenVerifier, sessionRepository, logger } = deps;

  if (typeof input.token !== 'string' || input.token.length === 0) {
    logger.info('logout_rejected', 'missing_token');
    return { outcome: 'rejected', reason: 'missing_token' };
  }

  let claims: Awaited<ReturnType<SessionTokenVerifier['verify']>>;
  try {
    claims = await tokenVerifier.verify({ token: input.token, now: input.now });
  } catch {
    claims = { outcome: 'invalid', reason: 'malformed' };
  }
  if (claims.outcome === 'invalid') {
    logger.warn('logout_rejected', claims.reason === 'expired' ? 'inactive_session' : 'invalid_token');
    return {
      outcome: 'rejected',
      reason: claims.reason === 'expired' ? 'inactive_session' : 'invalid_token',
    };
  }

  let revoked = false;
  try {
    revoked = await sessionRepository.revoke({ jti: claims.claims.jti, now: input.now });
  } catch {
    revoked = false;
  }
  if (!revoked) {
    logger.warn('logout_rejected', 'inactive_session');
    return { outcome: 'rejected', reason: 'inactive_session' };
  }

  logger.info('session_revoked', 'revoked');
  return { outcome: 'revoked' };
}
