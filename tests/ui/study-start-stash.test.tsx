import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { HTTPError } from 'ky';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { readRequestedSize, useStartStudy } from '../../src/ui/study/queries';

// #275 r5 B2 — useStartStudy 연결부: 성공 시에만 (setId, size) 기록.

const EXAM = 'saa-c03';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function fakeClient(json: unknown): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(() => ({ json: async () => json })),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('useStartStudy stash 연결 (#275 r5 B2)', () => {
  it('성공 시 readRequestedSize가 { setId, size }를 반환한다', async () => {
    const client = fakeClient({ id: 'set-9', items: [] });
    const { result } = renderHook(() => useStartStudy(client), { wrapper: wrapper() });
    await result.current.mutateAsync({ examId: EXAM, mode: 'all', size: 8 });
    expect(readRequestedSize(EXAM)).toEqual({ setId: 'set-9', size: 8 });
  });

  it('실패/409 시 stash가 기록되지 않는다', async () => {
    const failing = {
      get: vi.fn(),
      post: vi.fn(() => ({
        json: async () => {
          throw new HTTPError(new Response('{}', { status: 409 }), new Request('http://localhost/api/study/sets'), {} as never);
        },
      })),
      patch: vi.fn(),
    } as unknown as ApiClient;
    const { result } = renderHook(() => useStartStudy(failing), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ examId: EXAM, mode: 'all', size: 8 })).rejects.toThrow();
    expect(readRequestedSize(EXAM)).toBeNull();
  });

  it('size 생략 시 기록되지 않는다', async () => {
    const client = fakeClient({ id: 'set-4', items: [] });
    const { result } = renderHook(() => useStartStudy(client), { wrapper: wrapper() });
    await result.current.mutateAsync({ examId: EXAM, mode: 'all' });
    expect(readRequestedSize(EXAM)).toBeNull();
  });
});
