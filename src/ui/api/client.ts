import ky, { HTTPError, type KyInstance } from 'ky';

// same-origin 단일 Ky 클라이언트 (ADR-0011, architecture-boundaries 스킬).
// 컴포넌트에서 fetch 직접 호출 금지 — 이 모듈의 getMe/logout만 사용한다.
export function createApiClient(): KyInstance {
  return ky.create({
    prefix: '/',
    credentials: 'same-origin',
    timeout: 10_000,
    retry: 0,
  });
}

// 테스트 주입용 최소 인터페이스 — RTL 테스트에서 가짜 클라이언트로 교체한다.
export type ApiClient = Pick<KyInstance, 'get' | 'post'>;

export interface MeResponse {
  user: { id: string };
}

export interface ApiError {
  error: string;
}

// GET /api/me — 200 {user:{id}} / 401 {error:"unauthorized"}.
// 401은 오류가 아니라 비로그인 상태(null)로 매핑한다 (ADR-0018).
export async function getMe(client: ApiClient): Promise<string | null> {
  try {
    const data = await client.get('api/me').json<MeResponse>();
    return data.user.id;
  } catch (err) {
    if (err instanceof HTTPError && err.response.status === 401) return null;
    throw err;
  }
}

// POST /auth/logout — 성공 204(+쿠키 삭제) · CSRF 실패 403 · 미인증 401.
export async function logout(client: ApiClient): Promise<void> {
  await client.post('auth/logout');
}
