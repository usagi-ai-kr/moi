import type { OAuthIdentity } from '@/domain/auth/identity';
import type { AuthEventLogger, KakaoTokenClient, OAuthCrypto, OAuthStateRepository, OidcVerifier } from './ports';

/**
 * `GET /auth/kakao/callback`의 use case (ADR-0003, 이슈 #2).
 *
 * 순서 계약(fail-closed): 쿠키 확인·오류 파라미터 확인과 무관하게 **state 해시 기준
 * 조건부 단일 소비를 먼저** 수행한다. 잘못된/만료/재사용 state·동의 취소·바인딩 불일치·
 * 토큰 교환/검증 실패 모두 "이미 소비" 상태를 만들어 성공 경로 재사용을 구조적으로 막는다.
 */

export type KakaoLoginRejection =
  | 'invalid_state' /** 잘못된/만료/재사용 state, code 없음 */
  | 'browser_binding_mismatch' /** 쿠키 없음/불일치(타 브라우저) */
  | 'user_cancelled' /** error 파라미터(동의 취소 등) */
  | 'token_exchange_failed' /** 토큰 교환 upstream 실패/타임아웃/스키마 불일치 */
  | 'oidc_verification_failed'; /** 서명·iss/aud/exp/iat/nonce/sub 검증 실패, JWKS 오류 */

export type CompleteKakaoLoginResult =
  | { readonly outcome: 'success'; readonly identity: OAuthIdentity }
  | { readonly outcome: 'rejected'; readonly reason: KakaoLoginRejection };

export interface CompleteKakaoLoginInput {
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
  /** `__Host-moi_oauth` 쿠키 원문값(HTTP 계층에서 파싱). 없으면 null. */
  readonly browserBindingToken?: string | null;
  readonly now: number;
}

export interface CompleteKakaoLoginDeps {
  readonly stateRepo: OAuthStateRepository;
  readonly tokenClient: KakaoTokenClient;
  readonly oidcVerifier: OidcVerifier;
  readonly crypto: OAuthCrypto;
  readonly logger: AuthEventLogger;
}

export async function completeKakaoLogin(
  deps: CompleteKakaoLoginDeps,
  input: CompleteKakaoLoginInput,
): Promise<CompleteKakaoLoginResult> {
  const { stateRepo, tokenClient, oidcVerifier, crypto, logger } = deps;

  if (typeof input.state !== 'string' || input.state.length === 0) {
    logger.warn('kakao_login_rejected', 'invalid_state');
    return { outcome: 'rejected', reason: 'invalid_state' };
  }

  // fail-closed: state_hash 기준 조건부 단일 UPDATE(… RETURNING)로 먼저 소비한다.
  const stateHash = await crypto.sha256Hex(input.state);
  const consumed = await stateRepo.consume({ stateHash, now: input.now });

  if (typeof input.error === 'string' && input.error.length > 0) {
    logger.warn('kakao_login_rejected', 'user_cancelled');
    return { outcome: 'rejected', reason: 'user_cancelled' };
  }
  if (consumed === null) {
    logger.warn('kakao_login_rejected', 'invalid_state');
    return { outcome: 'rejected', reason: 'invalid_state' };
  }

  const bindingHash = input.browserBindingToken ? await crypto.sha256Hex(input.browserBindingToken) : null;
  if (bindingHash === null || bindingHash !== consumed.browserBindingHash) {
    logger.warn('kakao_login_rejected', 'browser_binding_mismatch');
    return { outcome: 'rejected', reason: 'browser_binding_mismatch' };
  }

  if (typeof input.code !== 'string' || input.code.length === 0) {
    logger.warn('kakao_login_rejected', 'invalid_state');
    return { outcome: 'rejected', reason: 'invalid_state' };
  }

  let idToken: string;
  try {
    ({ idToken } = await tokenClient.exchangeAuthorizationCode({
      code: input.code,
      codeVerifier: consumed.pkceVerifier,
    }));
  } catch {
    // upstream/타임아웃/스키마 불일치 — 원문(code/token)은 어떤 경로로도 기록되지 않는다.
    logger.warn('kakao_login_failed', 'token_exchange_failed');
    return { outcome: 'rejected', reason: 'token_exchange_failed' };
  }

  try {
    const identity = await oidcVerifier.verify({ idToken, nonce: consumed.nonce });
    logger.info('kakao_login_complete', 'success');
    return { outcome: 'success', identity };
  } catch {
    logger.warn('kakao_login_failed', 'oidc_verification_failed');
    return { outcome: 'rejected', reason: 'oidc_verification_failed' };
  }
}
