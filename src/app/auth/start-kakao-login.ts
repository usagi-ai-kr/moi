import type { AuthEventLogger, OAuthCrypto, OAuthStateRepository } from './ports';

/**
 * `GET /auth/kakao`의 use case (ADR-0003, 이슈 #2).
 * state(32B)·nonce(32B)·PKCE verifier(64B→86자 base64url)·브라우저 바인딩 토큰을 생성하고,
 * D1에는 해시만 저장한다. 원문 state/nonce/verifier는 로그·응답 본문에 노출되지 않는다
 * (state는 인가 URL로만, binding 토큰은 쿠키로만 이동한다).
 */

export interface StartKakaoLoginConfig {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly authorizeUrl: string;
  readonly ttlSeconds: number;
}

export interface StartKakaoLoginDeps {
  readonly stateRepo: OAuthStateRepository;
  readonly crypto: OAuthCrypto;
  readonly logger: AuthEventLogger;
  readonly config: StartKakaoLoginConfig;
}

export interface StartKakaoLoginInput {
  readonly now: number;
}

export interface StartedKakaoLogin {
  readonly authorizeUrl: string;
  /** 브라우저 한정 임시 쿠키(`__Host-moi_oauth`) 값 — 원문, 로그 금지. */
  readonly browserBindingToken: string;
  readonly cookieMaxAge: number;
}

export async function startKakaoLogin(deps: StartKakaoLoginDeps, input: StartKakaoLoginInput): Promise<StartedKakaoLogin> {
  const { stateRepo, crypto, logger, config } = deps;

  const state = crypto.randomToken(32);
  const nonce = crypto.randomToken(32);
  const pkceVerifier = crypto.randomToken(64); // 43~128자 base64url 요구 충족(86자)
  const browserBindingToken = crypto.randomToken(32);

  const [stateHash, browserBindingHash, codeChallenge] = await Promise.all([
    crypto.sha256Hex(state),
    crypto.sha256Hex(browserBindingToken),
    crypto.pkceS256Challenge(pkceVerifier),
  ]);

  await stateRepo.create({
    record: { stateHash, browserBindingHash, nonce, pkceVerifier },
    expiresAt: input.now + config.ttlSeconds,
    now: input.now,
  });

  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  logger.info('kakao_login_started', 'started');
  return { authorizeUrl: url.toString(), browserBindingToken, cookieMaxAge: config.ttlSeconds };
}
