import { assertValidExternalIdentity } from '@/domain/identity/user';
import type { ExternalAuthProvider, UserId } from '@/domain/identity/user';
import type { IdentityEventLogger, UserIdentityRepository } from './ports';

/**
 * `resolveOrCreate` use case (이슈 #3, ADR-0004).
 * 도메인 불변식(provider 허용 목록·비어 있지 않은 subject)을 영속 계층 호출 전에 강제하고,
 * 결과 원가(subject 원문)가 로그로 나가지 않는다. 동시성·보상 원가는 어댑터 계약이다.
 */

export interface ResolveOrCreateUserDeps {
  readonly repository: UserIdentityRepository;
  readonly logger: IdentityEventLogger;
}

export interface ResolveOrCreateUserInput {
  readonly provider: ExternalAuthProvider;
  readonly subject: string;
  readonly now: number;
}

export type ResolveOrCreateUserResult =
  | { readonly outcome: 'resolved'; readonly userId: UserId }
  | { readonly outcome: 'rejected' };

export async function resolveOrCreateUser(
  deps: ResolveOrCreateUserDeps,
  input: ResolveOrCreateUserInput,
): Promise<ResolveOrCreateUserResult> {
  const { repository, logger } = deps;

  try {
    assertValidExternalIdentity({ provider: input.provider, providerSubject: input.subject });
  } catch {
    logger.warn('user_identity_rejected', 'invalid_input');
    return { outcome: 'rejected' };
  }

  try {
    const { userId } = await repository.resolveOrCreate({
      provider: input.provider,
      subject: input.subject,
      now: input.now,
    });
    logger.info('user_identity_resolved', 'resolved');
    return { outcome: 'resolved', userId };
  } catch {
    logger.error('user_identity_failed', 'persistence_failure');
    throw new Error('identity: failed to resolve user identity');
  }
}
