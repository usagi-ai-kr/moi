import { HTTPError } from 'ky';
import type { ApiClient } from './types';

/**
 * 세션 API 클라이언트 — `/api/me`(로그인 사용자·계정 정보)와 `/auth/logout`.
 * 계정 정보 DTO는 #234/ADR-0072 계약이다: 내부 id·가입일·최근 로그인, 값이 없으면 null.
 */

/** 로그인 사용자 — `/api/me` DTO(#234/ADR-0072). 시간은 epoch seconds, 값이 없으면 null. */
export interface MeUser {
  /** 내부 UUID — 화면에 표시하지 않는다(서버 계약 유지). */
  readonly id: string;
  /** 가입일 — `users.created_at`. */
  readonly createdAt: number | null;
  /** 최근 로그인 — `MAX(sessions.issued_at)`. 이력이 없으면 null. */
  readonly lastLoginAt: number | null;
}

export interface MeResponse {
  user: MeUser;
}

/**
 * 숫자 필드 정규화 — 서버가 못 준 값은 '없음(null)'으로 내린다(1970 오표기 방지).
 * 단위는 epoch **seconds** 고정(ADR-0056) — ms로 임의 해석하지 않는다.
 * 하한(1971 이전 값) 등 표시 판단은 `formatDateTime`이 담당한다(#260).
 */
function toEpochSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// GET /api/me — 200 {user:{id,createdAt,lastLoginAt}} / 401 {error:"unauthorized"}.
// 401은 오류가 아니라 비로그인 상태(null)로 매핑한다 (ADR-0018).
export async function getMe(client: ApiClient): Promise<MeUser | null> {
  try {
    const data = await client.get('api/me').json<MeResponse>();
    return {
      id: data.user.id,
      createdAt: toEpochSeconds(data.user.createdAt),
      lastLoginAt: toEpochSeconds(data.user.lastLoginAt),
    };
  } catch (err) {
    if (err instanceof HTTPError && err.response.status === 401) return null;
    throw err;
  }
}

// POST /auth/logout — 성공 204(+쿠키 삭제) · CSRF 실패 403 · 미인증 401.
export async function logout(client: ApiClient): Promise<void> {
  await client.post('auth/logout');
}
