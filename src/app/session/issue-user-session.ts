import { isValidUserId } from '@/domain/identity/user';
import type { SessionEventLogger, SessionRepository, SessionTokenIssuer } from './ports';

/**
 * 세션 발급 use case (이슈 #4, ADR-0005).
 * 토큰 발급 → D1 활성화 기록 순서이며, **활성화 실패 시 토큰을 반환하지 않는다(fail-closed)**.
 * userId는 내부 UUID여야 한다(외부 sub 직접 발급 금지).
 */

export interface IssueUserSessionDeps {
  readonly tokenIssuer: SessionTokenIssuer;
  readonly sessionRepository: SessionRepository;
  readonly logger: SessionEventLogger;
}

export interface IssueUserSessionInput {
  readonly userId: string;
  readonly now: number;
}

export type IssueUserSessionResult =
  | { readonly outcome: 'issued'; readonly token: string; readonly claims: { sub: string; jti: string; iat: number; exp: number } }
  | { readonly outcome: 'rejected' };

export async function issueUserSession(deps: IssueUserSessionDeps, input: IssueUserSessionInput): Promise<IssueUserSessionResult> {
  const { tokenIssuer, sessionRepository, logger } = deps;

  if (typeof input.userId !== 'string' || !isValidUserId(input.userId)) {
    logger.warn('session_issuance_rejected', 'invalid_user_id');
    return { outcome: 'rejected' };
  }

  let issued: Awaited<ReturnType<SessionTokenIssuer['issue']>>;
  try {
    issued = await tokenIssuer.issue({ userId: input.userId, now: input.now });
  } catch {
    logger.error('session_issuance_failed', 'token_issue_failure');
    return { outcome: 'rejected' };
  }

  try {
    await sessionRepository.activate({
      jti: issued.claims.jti,
      userId: input.userId,
      issuedAt: issued.claims.iat,
      expiresAt: issued.claims.exp,
    });
  } catch {
    logger.error('session_issuance_failed', 'activation_failure');
    return { outcome: 'rejected' };
  }

  logger.info('session_issued', 'issued');
  return { outcome: 'issued', token: issued.token, claims: issued.claims };
}
