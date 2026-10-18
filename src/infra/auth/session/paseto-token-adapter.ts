import { decrypt, encrypt } from 'paseto-ts/v4';
import { z } from 'zod';
import type { SessionTokenIssuer, SessionTokenVerifier, SessionVerifyResult } from '@/app/session/ports';
import { isValidUserId } from '@/domain/identity/user';
import { SESSION_TTL_SECONDS, type SessionClaims } from '@/domain/session/session';
import type { PasetoKeyring } from './keyring';

/**
 * paseto-ts v4.local 토큰 어댑터 (이슈 #4, ADR-0005).
 * - 발급: sub(내부 UUID)·jti(무작위 32B base64url)·iat·exp(ISO 8601) 암호화.
 * - 검증: 키링의 각 키로 복호화 시도(회전 공존), 성공 1건의 claims를 epoch seconds로 변환 반환.
 *   실패 원가: malformed/tampered/wrong_key/expired — 원문 토큰은 어떤 사유에도 로그로 나가지 않는다.
 * - paseto-ts는 복호화 시 iat 미래/exp 만료를 자체 거부한다(이중 방어로 별도 검증도 수행).
 * - Workers 호환: @stablelib 순수 JS 구현 — vitest-pool-workers(workerd)에서 스파이크(#1) 통과.
 */
const payloadSchema = z.object({
  sub: z.string().refine((v) => isValidUserId(v), 'sub must be internal uuid'),
  jti: z.string().min(1).max(128),
  iat: z.string().min(1),
  exp: z.string().min(1),
});

function toEpochSeconds(isoDate: string): number {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) throw new Error('paseto: invalid date claim');
  return Math.floor(parsed / 1000);
}

function assertClaims(claims: SessionClaims, now: number): void {
  if (!isValidUserId(claims.sub) || claims.jti.length === 0) {
    throw new Error('paseto: invalid claims');
  }
  if (claims.exp <= now) {
    throw new Error('paseto: expired');
  }
}

export function createPasetoSessionTokenAdapter(keyring: PasetoKeyring): SessionTokenIssuer & SessionTokenVerifier {
  return {
    async issue({ userId, now }) {
      const jtiBytes = new Uint8Array(32);
      crypto.getRandomValues(jtiBytes);
      const binary = Array.from(jtiBytes)
        .map((b) => String.fromCharCode(b))
        .join('');
      const jti = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const claims: SessionClaims = { sub: userId, jti, iat: now, exp: now + SESSION_TTL_SECONDS };
      const token = await encrypt(
        keyring.current,
        { sub: claims.sub, jti: claims.jti, iat: new Date(claims.iat * 1000).toISOString(), exp: new Date(claims.exp * 1000).toISOString() },
        { addIat: false, addExp: false },
      );
      return { token, claims };
    },

    async verify({ token, now }): Promise<SessionVerifyResult> {
      if (typeof token !== 'string' || !token.startsWith('v4.local.')) {
        return { outcome: 'invalid', reason: 'malformed' };
      }
      let lastFailure: 'tampered' | 'wrong_key' | 'expired' | 'malformed' = 'malformed';
      for (const key of keyring.verifyKeys) {
        try {
          const { payload } = await decrypt(key, token);
          const parsed = payloadSchema.parse(payload);
          const claims: SessionClaims = {
            sub: parsed.sub,
            jti: parsed.jti,
            iat: toEpochSeconds(parsed.iat),
            exp: toEpochSeconds(parsed.exp),
          };
          assertClaims(claims, now);
          return { outcome: 'valid', claims };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('has expired') || message.includes('paseto: expired')) {
            lastFailure = 'expired';
            break; // 클레임 검증 실패는 키와 무관 — 다른 키 시도 불요
          }
          if (message.includes('Decryption failed') || message.includes('authentication tag')) {
            lastFailure = 'wrong_key';
            continue; // 다른 허용 키로 재시도(회전 공존)
          }
          lastFailure = 'malformed';
        }
      }
      return { outcome: 'invalid', reason: lastFailure };
    },
  };
}
