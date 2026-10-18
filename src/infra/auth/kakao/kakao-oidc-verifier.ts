import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OidcVerifier } from '@/app/auth/ports';

/**
 * 카카오 OIDC ID token 검증 어댑터 (ADR-0003).
 * - 고정 URL JWKS(`createRemoteJWKSet`), RS256만 허용, issuer/audience 고정,
 *   clockTolerance 60초. kid 캐시 미스 시 쿨다운(cooldownDuration 30초) 경과 후
 *   검증 1회당 최대 1회 재조회한다 — 무제한 재조회(공급자 DoS 유발)를 막는다.
 * - JWKS 저장소는 isolate 내 공유(shared)해 쿨다운이 요청에 걸쳐 적용된다.
 *   테스트는 `shared: false`로 인스턴스를 격리한다.
 * - jose가 검증하지 않는 iat 미래(±60초 초과)·nonce 일치·비어 있지 않은 sub는 별도 검증.
 * - 검증 실패 사유는 내부 사유 외 로그로 나가지 않는다(원문/JWKS 로그 금지).
 */
const KAKAO_JWKS_URL = 'https://kauth.kakao.com/.well-known/jwks.json';
const KAKAO_ISSUER = 'https://kauth.kakao.com';
const CLOCK_TOLERANCE_SECONDS = 60;
const JWKS_TIMEOUT_MS = 8000;
/** kid 미스 재조회 쿨다운 — 같은 저장소에서 30초당 최대 1회 재조회로 제한한다. */
const JWKS_COOLDOWN_MS = 30_000;

export interface KakaoOidcVerifierConfig {
  readonly clientId: string;
  /** epoch seconds — 기본 시스템 시각, 테스트에서 결정적으로 주입. */
  readonly now?: () => number;
  /** isolate 내 공유 JWKS 저장소 사용. 기본 false — production 조립(runtime)은 true로 공유한다. */
  readonly shared?: boolean;
}

/** isolate 수명 동안 재사용되는 공유 JWKS 저장소 — 쿨다운이 요청에 걸쳐 적용된다. */
let sharedJwksStore: ReturnType<typeof createRemoteJWKSet> | null = null;

export function createKakaoOidcVerifier(config: KakaoOidcVerifierConfig): OidcVerifier {
  const now = config.now ?? (() => Math.floor(Date.now() / 1000));
  let jwks: ReturnType<typeof createRemoteJWKSet>;
  if (config.shared === true) {
    if (sharedJwksStore === null) {
      sharedJwksStore = createRemoteJWKSet(new URL(KAKAO_JWKS_URL), {
        cooldownDuration: JWKS_COOLDOWN_MS,
        timeoutDuration: JWKS_TIMEOUT_MS,
      });
    }
    jwks = sharedJwksStore;
  } else {
    jwks = createRemoteJWKSet(new URL(KAKAO_JWKS_URL), {
      cooldownDuration: JWKS_COOLDOWN_MS,
      timeoutDuration: JWKS_TIMEOUT_MS,
    });
  }

  return {
    async verify({ idToken, nonce }) {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: KAKAO_ISSUER,
        audience: config.clientId,
        algorithms: ['RS256'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: new Date(now() * 1000),
        requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub', 'nonce'],
      });

      if (typeof payload.iat !== 'number' || payload.iat > now() + CLOCK_TOLERANCE_SECONDS) {
        throw new Error('oidc: iat is in the future beyond tolerance');
      }
      if (typeof payload.nonce !== 'string' || payload.nonce.length === 0 || payload.nonce !== nonce) {
        throw new Error('oidc: nonce mismatch');
      }
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('oidc: empty sub');
      }
      return { provider: 'kakao', sub: payload.sub };
    },
  };
}
