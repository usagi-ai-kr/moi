import ky from 'ky';

// same-origin 단일 Ky 클라이언트 (ADR-0011, architecture-boundaries 스킬).
// 401 → TanStack Query 캐시 재검증/리셋 연결은 0.1.3(#4)에서 구현한다.
export function createApiClient() {
  return ky.create({
    prefix: '/',
    credentials: 'same-origin',
    timeout: 10_000,
    retry: 0,
  });
}
