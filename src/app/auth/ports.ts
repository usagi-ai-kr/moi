import type { OAuthIdentity } from '@/domain/auth/identity';

/**
 * 카카오 OIDC 인증 교환의 Port 정의 (ADR-0003, 이슈 #2).
 * 구현은 infra(auth/kakao) 어댑터가 담당하고, app은 외부 패키지·네트워크·DB를 모른다.
 * 모든 시간은 epoch seconds로 주입한다(테스트 결정성).
 */

/** D1 `oauth_states`에 저장되는 행 — 원문 state/binding은 저장하지 않는다(해시만). */
export interface OAuthStateRecord {
  readonly stateHash: string;
  readonly browserBindingHash: string;
  readonly nonce: string;
  readonly pkceVerifier: string;
}

/** 조건부 소비에 성공해 반환된 행. */
export type ConsumedOAuthState = OAuthStateRecord;

export interface OAuthStateRepository {
  /** 새 로그인 시도 상태를 저장한다(TTL 내 1회 소비 전제). */
  create(input: { record: OAuthStateRecord; expiresAt: number; now: number }): Promise<void>;
  /**
   * fail-closed 1회 소비: `consumed_at IS NULL AND expires_at > now` 조건의
   * 조건부 단일 UPDATE ... RETURNING (동시 콜백에서 한 요청만 승리).
   */
  consume(input: { stateHash: string; now: number }): Promise<ConsumedOAuthState | null>;
}

/** 카카오 토큰 교환 결과 — access/refresh token은 저장·로그·반환하지 않고 폐기한다. */
export interface KakaoTokenClient {
  exchangeAuthorizationCode(input: { code: string; codeVerifier: string }): Promise<{ idToken: string }>;
}

/** ID token 서명·issuer/audience/exp·nonce·sub 검증 결과를 반환한다. */
export interface OidcVerifier {
  verify(input: { idToken: string; nonce: string }): Promise<OAuthIdentity>;
}

/** 난수·해시·PKCE challenge 원가(Randomness/Hash) 포트 — WebCrypto 기반으로 구현한다. */
export interface OAuthCrypto {
  randomToken(byteLength: number): string;
  sha256Hex(value: string): Promise<string>;
  pkceS256Challenge(verifier: string): Promise<string>;
}

/**
 * ADR-0006 로그 계약(화이트리스트): 출력 필드는 level/msg/requestId/outcome뿐이다.
 * 코드·state·nonce·토큰·쿠키·시크릿·sub 원문을 전달할 방법 자체가 없다.
 */
export interface AuthEventLogger {
  info(msg: string, outcome?: string): void;
  warn(msg: string, outcome?: string): void;
  error(msg: string, outcome?: string): void;
}
