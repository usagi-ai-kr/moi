import { HTTPError } from 'ky';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient, getCurrentStudySet, type ApiClient, type StudyActiveSet } from '../../src/ui/api/client';

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

describe('getCurrentStudySet (#148)', () => {
  it('examId 쿼리로 현재 활성 세트를 조회한다', async () => {
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
