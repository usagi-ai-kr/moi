import type { SessionClaims, SessionRejectionReason } from '@/domain/session/session';

/**
 * 세션 Port 정의 (이슈 #4, ADR-0005).
 * 토큰 발급/검증(암호 원가)과 세션 메타데이터(D1)를 분리한다.
 * D1에는 jti 해시만 저장되므로 Port는 원문 jti를 받고 어댑터가 해시한다.
 */

export interface SessionTokenIssuer {
  /** 새 세션 토큰 발급 — 항상 새 jti(세션 고정 방지). exp = now + 24h. */
  issue(input: { userId: string; now: number }): Promise<{ token: string; claims: SessionClaims }>;
}

export interface SessionTokenVerifier {
  /** 토큰 검증(키링·변조·만료·클레임). 예외 대신 결과 원가로 반환한다. */
  verify(input: { token: string; now: number }): Promise<SessionVerifyResult>;
}

export type SessionVerifyResult =
  | { readonly outcome: 'valid'; readonly claims: SessionClaims }
  | { readonly outcome: 'invalid'; readonly reason: 'malformed' | 'tampered' | 'wrong_key' | 'expired' };

export interface SessionRepository {
  /** 세션 활성화 기록(jti 해시만 저장 — PASETO 원문 저장 금지). */
  activate(input: { jti: string; userId: string; issuedAt: number; expiresAt: number }): Promise<void>;
  /** jti 활성 여부(revoked_at IS NULL AND expires_at > now). */
  findActive(input: { jti: string; now: number }): Promise<{ userId: string; expiresAt: number } | null>;
  /** 세션 폐기. 이미 폐기/미존재면 false. */
  revoke(input: { jti: string; now: number }): Promise<boolean>;
}

/** ADR-0006 화이트리스트 로그 계약 — 토큰/쿠키/jti/userId 원문을 전달할 방법이 없다. */
export interface SessionEventLogger {
  info(msg: string, outcome?: string): void;
  warn(msg: string, outcome?: string): void;
  error(msg: string, outcome?: string): void;
}

export type { SessionRejectionReason };
