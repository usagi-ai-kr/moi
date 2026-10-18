/**
 * 앱 세션 도메인 타입·불변식 (이슈 #4, ADR-0005).
 * - PASETO v4.local payload: `sub`(내부 UUID)·`jti`(무작위)·`iat`·`exp`.
 * - 절대 만료 24시간, 슬라이딩 갱신 없음. 로그인마다 새 jti/토큰(세션 고정 방지).
 * - PASETO 원문은 도메인/저장소 어디에도 남지 않는다(D1에는 jti 해시만).
 */

/** 세션 절대 만료(24시간). */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** 세션 토큰 클레임 — 시간은 epoch seconds(토큰 내부는 ISO 8601, 어댑터가 변환한다). */
export interface SessionClaims {
  readonly sub: string;
  readonly jti: string;
  readonly iat: number;
  readonly exp: number;
}

export type SessionRejectionReason = 'missing_token' | 'invalid_token' | 'expired_token' | 'inactive_session';
