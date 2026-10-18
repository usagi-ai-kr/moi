import type { CompleteKakaoLoginInput, CompleteKakaoLoginResult, KakaoLoginRejection } from '@/app/auth/complete-kakao-login';
import type { ResolveOrCreateUserResult } from '@/app/identity/resolve-or-create-user';
import type { IssueUserSessionResult } from './issue-user-session';
import type { SessionEventLogger } from './ports';

/**
 * 로그인 완료 합성 use case (이슈 #4): 카카오 identity 검증(#2) → 내부 user resolve(#3) →
 * 세션 발급(#4). 각 단계는 독립 use case이며 이 합성으로 HTTP 계층이 순서를 반복하지 않는다.
 * 성공 결과의 token은 Set-Cookie 직렬화를 위한 내부 전달용이며, 응답 본문/URL에는 절대 노출되지 않는다.
 */

export interface CompleteLoginDeps {
  readonly completeKakaoLogin: (input: CompleteKakaoLoginInput) => Promise<CompleteKakaoLoginResult>;
  readonly resolveOrCreateUser: (input: { provider: 'kakao'; subject: string; now: number }) => Promise<ResolveOrCreateUserResult>;
  readonly issueUserSession: (input: { userId: string; now: number }) => Promise<IssueUserSessionResult>;
  readonly logger: SessionEventLogger;
}

export interface CompleteLoginInput {
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
  readonly browserBindingToken?: string | null;
  readonly now: number;
}

export type CompleteLoginResult =
  | {
      readonly outcome: 'success';
      readonly userId: string;
      readonly session: { readonly token: string; readonly expiresAt: number };
    }
  | { readonly outcome: 'rejected'; readonly reason: KakaoLoginRejection | 'identity_resolve_failed' | 'session_issue_failed' };

export async function completeLogin(deps: CompleteLoginDeps, input: CompleteLoginInput): Promise<CompleteLoginResult> {
  const { logger } = deps;

  const kakao = await deps.completeKakaoLogin({
    code: input.code,
    state: input.state,
    error: input.error,
    browserBindingToken: input.browserBindingToken,
    now: input.now,
  });
  if (kakao.outcome === 'rejected') {
    logger.warn('login_rejected', kakao.reason);
    return { outcome: 'rejected', reason: kakao.reason };
  }

  const resolved = await deps.resolveOrCreateUser({
    provider: kakao.identity.provider,
    subject: kakao.identity.sub,
    now: input.now,
  });
  if (resolved.outcome !== 'resolved') {
    logger.error('login_rejected', 'identity_resolve_failed');
    return { outcome: 'rejected', reason: 'identity_resolve_failed' };
  }

  const session = await deps.issueUserSession({ userId: resolved.userId, now: input.now });
  if (session.outcome !== 'issued') {
    logger.error('login_rejected', 'session_issue_failed');
    return { outcome: 'rejected', reason: 'session_issue_failed' };
  }

  logger.info('login_completed', 'success');
  return { outcome: 'success', userId: resolved.userId, session: { token: session.token, expiresAt: session.claims.exp } };
}
