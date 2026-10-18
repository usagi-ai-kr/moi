import { base64Decode, base64UrlEncode } from './crypto';

/**
 * PASETO v4.local 키링 (이슈 #4, ADR-0005).
 * - 비밀값은 Cloudflare Secrets로만 공급: `PASETO_KEY_V1`(필수)·`PASETO_KEY_V2`(선택).
 * - put-paseto-key.sh는 32바이트 base64로 기록 → PASERK(`k4.local.` 접두, base64url)로 정규화한다.
 *   (이미 `k4.local.` 형식이면 그대로 사용 — 운영 편의)
 * - 회전: V2가 있으면 V2가 current(신규 발급), V1은 검증 전용으로 공존. V2가 없으면 V1이 current.
 * - 미지 키(키링 외부) 토큰은 어떤 키로도 복호화되지 않아 거부된다.
 * - total 함수: 키 미설정·형식 오류는 예외 대신 빈 키링(current ''·verifyKeys [])로 반환 —
 *   발급/검증이 전부 거부되는 fail-closed 동작(500 대신 401)을 보장한다.
 */
export const PASETO_KEY_MAGIC = 'k4.local.';

export interface PasetoKeyring {
  /** 신규 발급에 사용하는 current 키 (PASERK 형식). 미설정이면 ''(발급 불가). */
  readonly current: string;
  /** 검증 허용 키 목록 (PASERK 형식) — 회전 중 이전 키 공존. */
  readonly verifyKeys: readonly string[];
}

export interface PasetoKeyringEnv {
  readonly PASETO_KEY_V1: string;
  readonly PASETO_KEY_V2?: string;
}

/** 32바이트 base64 → PASERK(k4.local.) 문자열. PASERK 형식이 입력되면 그대로 사용한다. */
export function normalizePasetoLocalKey(secretValue: string): string {
  if (secretValue.startsWith(PASETO_KEY_MAGIC)) {
    return secretValue;
  }
  const bytes = base64Decode(secretValue);
  if (bytes.byteLength !== 32) {
    throw new Error('paseto: local key must be 32 bytes');
  }
  return `${PASETO_KEY_MAGIC}${base64UrlEncode(bytes)}`;
}

/** 단일 후보 정규화(형식 오류 시 null — total 처리용). */
function normalizeOrNull(secretValue: string | undefined): string | null {
  if (typeof secretValue !== 'string' || secretValue.length === 0) return null;
  try {
    return normalizePasetoLocalKey(secretValue);
  } catch {
    return null;
  }
}

export function createPasetoKeyring(env: PasetoKeyringEnv): PasetoKeyring {
  // 우선순위: V2(신규) → V1. 형식 오류·미설정 후보는 버리고 중복은 제거한다.
  const normalized = [normalizeOrNull(env.PASETO_KEY_V2), normalizeOrNull(env.PASETO_KEY_V1)].filter(
    (key): key is string => key !== null,
  );
  const verifyKeys = Array.from(new Set(normalized));
  return {
    current: verifyKeys[0] ?? '',
    verifyKeys,
  };
}
