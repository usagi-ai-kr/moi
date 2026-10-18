import type { SessionEventLogger, SessionRejectionReason, SessionRepository, SessionTokenVerifier, SessionVerifyResult } from './ports';
import type { SessionClaims } from '@/domain/session/session';

/**
 * 세션 검증 use case (이슈 #4, ADR-0005) — 보호 요청 미들웨어의 근거.
 * 순서: 쿠키 토큰 존재 → 토큰 검증(키링·변조·만료·클레임) → D1 jti 활성 검사 →
 * claims.sub와 저장소 user_id 교차 확인.
 */

export interface AuthenticateSessionDeps {
  readonly tokenVerifier: SessionTokenVerifier;
  readonly sessionRepository: SessionRepository;
  readonly logger: SessionEventLogger;
}

export interface AuthenticateSessionInput {
  /** `__Host-moi_session` 쿠키 원문값(HTTP 계층에서 파싱). 없으면 null. */
  readonly token?: string | null;
  readonly now: number;
}

export type AuthenticateSessionResult =
  | { readonly outcome: 'authenticated'; readonly userId: string; readonly expiresAt: number }
  | { readonly outcome: 'rejected'; readonly reason: SessionRejectionReason };

export async function authenticateSession(
  deps: AuthenticateSessionDeps,
  input: AuthenticateSessionInput,
): Promise<AuthenticateSessionResult> {
  const { tokenVerifier, sessionRepository, logger } = deps;

  if (typeof input.token !== 'string' || input.token.length === 0) {
    logger.info('session_rejected', 'missing_token');
    return { outcome: 'rejected', reason: 'missing_token' };
  }

  let verify: SessionVerifyResult;
  try {
    verify = await tokenVerifier.verify({ token: input.token, now: input.now });
  } catch {
    verify = { outcome: 'invalid', reason: 'malformed' };
  }
  if (verify.outcome === 'invalid') {
    const reason: SessionRejectionReason = verify.reason === 'expired' ? 'expired_token' : 'invalid_token';
    logger.warn('session_rejected', reason);
    return { outcome: 'rejected', reason };
  }
  const claims: SessionClaims = verify.claims;

  const active = await sessionRepository.findActive({ jti: claims.jti, now: input.now }).catch(() => null);
  if (active === null || active.userId !== claims.sub) {
    logger.warn('session_rejected', 'inactive_session');
    return { outcome: 'rejected', reason: 'inactive_session' };
  }

  logger.info('session_authenticated', 'authenticated');
  return { outcome: 'authenticated', userId: claims.sub, expiresAt: active.expiresAt };
}
