import { HTTPError } from 'ky';
import { describe, expect, it, vi } from 'vitest';
import {
  createApiClient,
  getCurrentStudySet,
  getMe,
  type ApiClient,
  type StudyActiveSet,
} from '../../src/ui/api/client';

describe('ui/api/client (스캐폴드 스모크)', () => {
  it('same-origin Ky 클라이언트를 생성한다', () => {
    const client = createApiClient();
    expect(client).toBeTruthy();
    expect(typeof client.get).toBe('function');
  });
});

function httpError(status: number, body: unknown, url = 'http://localhost/api/study/sets/current'): HTTPError {
  return new HTTPError(new Response(JSON.stringify(body), { status }), new Request(url), {} as never);
}

function fakeClient(get: (path: string) => Promise<unknown>): { client: ApiClient; paths: string[] } {
  const paths: string[] = [];
  const client = {
    get: vi.fn((path: string) => {
      paths.push(String(path));
      return { json: () => get(String(path)) };
    }),
  } as unknown as ApiClient;
  return { client, paths };
}

describe('getCurrentStudySet (#148)', () => {  it('examId 쿼리로 현재 활성 세트를 조회한다', async () => {
    const set = { id: 'set-1', examId: 'saa-c03', status: 'active', items: [] } as unknown as StudyActiveSet;
    const { client, paths } = fakeClient(async () => set);
    await expect(getCurrentStudySet(client, 'saa-c03')).resolves.toBe(set);
    expect(paths).toEqual(['api/study/sets/current?examId=saa-c03']);
  });

  it('404는 활성 세트 없음(null)으로 매핑한다', async () => {
    const { client } = fakeClient(async () => {
      throw httpError(404, { error: 'no_active_set' });
    });
    await expect(getCurrentStudySet(client, 'saa-c03')).resolves.toBeNull();
  });

  it('404 외 오류는 그대로 던진다', async () => {
    const { client } = fakeClient(async () => {
      throw httpError(500, { error: 'internal' });
    });
    await expect(getCurrentStudySet(client, 'saa-c03')).rejects.toBeInstanceOf(HTTPError);
  });
});

describe('getMe — 계정 DTO(#234/ADR-0072)', () => {
  it('내부 id·가입일·최근 로그인을 그대로 돌려준다', async () => {
    const { client, paths } = fakeClient(async () => ({
      user: { id: '123e4567-e89b-12d3-a456-426614174000', createdAt: 1_700_000_000, lastLoginAt: 1_700_100_000 },
    }));
    await expect(getMe(client)).resolves.toEqual({
      id: '123e4567-e89b-12d3-a456-426614174000',
      createdAt: 1_700_000_000,
      lastLoginAt: 1_700_100_000,
    });
    expect(paths).toEqual(['api/me']);
  });

  it('401은 비로그인(null)로 매핑한다', async () => {
    const { client } = fakeClient(async () => {
      throw httpError(401, { error: 'unauthorized' }, 'http://localhost/api/me');
    });
    await expect(getMe(client)).resolves.toBeNull();
  });

  it('값이 없거나 숫자가 아니면 null로 정규화한다(1970 오표기 방지)', async () => {
    const { client } = fakeClient(async () => ({ user: { id: 'u-1' } }));
    await expect(getMe(client)).resolves.toEqual({ id: 'u-1', createdAt: null, lastLoginAt: null });
  });

  it('401 외 오류는 그대로 던진다', async () => {
    const { client } = fakeClient(async () => {
      throw httpError(500, { error: 'internal' }, 'http://localhost/api/me');
    });
    await expect(getMe(client)).rejects.toBeInstanceOf(HTTPError);
  });
});
