/**
 * 관리 API 인증·인가 정책 — 순수 함수 (이슈 #47, ADR-0019).
 * - 전송: `Authorization: Bearer <token>` 헤더만. 쿠키 미사용(CSRF 비대상).
 * - 스코프: 'questions:write'는 읽기 포함. 그 외 스코프 문자열은 권한 없음.
 */

export type AdminScope = 'questions:read' | 'questions:write';

export function parseBearerToken(authorization: string | null | undefined): string | null {
  if (typeof authorization !== 'string') return null;
  const match = /^Bearer (.+)$/.exec(authorization.trim());
  if (!match || match[1].trim().length === 0) return null;
  return match[1].trim();
}

function normalizeScope(scope: string): AdminScope | null {
  return scope === 'questions:read' || scope === 'questions:write' ? scope : null;
}

export function canRead(scope: string): boolean {
  return normalizeScope(scope) !== null;
}

export function canWrite(scope: string): boolean {
  return normalizeScope(scope) === 'questions:write';
}
