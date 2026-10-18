import type { CompleteKakaoLoginDeps } from '@/app/auth/complete-kakao-login';
import type { StartKakaoLoginDeps } from '@/app/auth/start-kakao-login';
import { createJsonLogger } from '@/infra/logging/json-logger';
import { createWebCryptoOAuthCrypto } from './crypto';
import { createD1OAuthStateRepository } from './d1-oauth-state-repository';
import { createKakaoOidcVerifier } from './kakao-oidc-verifier';
import { createKakaoTokenClient } from './kakao-token-client';

/** 카카오 인가 엔드포인트(고정, ADR-0003). */
export const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
/** state/browser binding TTL (600초, ADR-0003). */
export const OAUTH_STATE_TTL_SECONDS = 600;

export interface KakaoAuthRuntime {
  readonly start: StartKakaoLoginDeps;
  readonly complete: CompleteKakaoLoginDeps;
  readonly ttlSeconds: number;
}

/** Env 바인딩으로부터 요청 단위 포트 어댑터를 조립한다(테스트에서는 스파이로 교체 가능). */
export function createKakaoAuthRuntime(
  env: Env,
  requestId: string,
  options?: { readonly sharedJwks?: boolean },
): KakaoAuthRuntime {
  const logger = createJsonLogger(requestId);
  const crypto = createWebCryptoOAuthCrypto();
  const stateRepo = createD1OAuthStateRepository(env.DB);
  const tokenClient = createKakaoTokenClient({
    clientId: env.KAKAO_CLIENT_ID,
    clientSecret: env.KAKAO_CLIENT_SECRET,
    redirectUri: env.KAKAO_REDIRECT_URI,
  });
  const oidcVerifier = createKakaoOidcVerifier({
    clientId: env.KAKAO_CLIENT_ID,
    // production은 isolate 내 공유 JWKS 저장소로 kid 미스 재조회 쿨다운을 요청에 걸쳐 적용한다.
    shared: options?.sharedJwks ?? true,
  });

  return {
    start: {
      stateRepo,
      crypto,
      logger,
      config: {
        clientId: env.KAKAO_CLIENT_ID,
        redirectUri: env.KAKAO_REDIRECT_URI,
        authorizeUrl: KAKAO_AUTHORIZE_URL,
        ttlSeconds: OAUTH_STATE_TTL_SECONDS,
      },
    },
    complete: { stateRepo, tokenClient, oidcVerifier, crypto, logger },
    ttlSeconds: OAUTH_STATE_TTL_SECONDS,
  };
}
