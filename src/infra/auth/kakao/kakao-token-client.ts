import { z } from 'zod';
import type { KakaoTokenClient } from '@/app/auth/ports';

/**
 * 카카오 토큰 교환 어댑터 (ADR-0003) — 서버 간 POST, timeout 8초, 응답 Zod 검증.
 * access/refresh token 원문은 저장·로그·반환하지 않고 id_token만 반환한다.
 */
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const TOKEN_TIMEOUT_MS = 8000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
});

export interface KakaoTokenClientConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export function createKakaoTokenClient(config: KakaoTokenClientConfig): KakaoTokenClient {
  return {
    async exchangeAuthorizationCode({ code, codeVerifier }) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
        code_verifier: codeVerifier,
      });
      const res = await fetch(KAKAO_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error('kakao token endpoint rejected');
      }
      const parsed = tokenResponseSchema.parse(await res.json());
      return { idToken: parsed.id_token };
    },
  };
}
