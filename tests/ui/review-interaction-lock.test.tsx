import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { ReviewScreen } from '../../src/ui/review/ReviewScreen';

// #270 차단1 — 복습 시작 경로. 기존 isBusy(리렌더 이후 disabled)만으로 같은 틱 연속 호출이
// 막히는지 RTL로 검증한다. 추정 금지: POST 횟수로 재현 여부를 판정한다.

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request('http://localhost/api/test'),
    {} as never,
  );
}

function makeClient(gate: Promise<unknown>, counter: { n: number }): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        const u = new URL(String(path), 'http://localhost/');
        if (u.pathname === '/api/review/sessions/current') throw httpError(404, { error: 'not_found' });
        if (u.pathname === '/api/review/candidates') {
          return { examId: 'saa-c03', mode: 'wrong', total: 5, items: [] };
        }
        if (u.pathname === '/api/review/bookmarks') return { examId: 'saa-c03', total: 0, items: [] };
        throw httpError(404, { error: 'not_found' });
      },
    })),
    post: vi.fn((p: string) => {
      if (String(p) === 'api/review/sessions') {
        counter.n += 1;
        return { json: () => gate };
      }
      return { json: async () => ({}) };
    }),
    patch: vi.fn(() => ({ json: async () => ({}) })),
  } as unknown as ApiClient;
}

function renderReview(client: ApiClient) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/review?mode=wrong']}>
        <Routes>
          <Route path="/review" element={<ReviewScreen client={client} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('#270 차단1 — 복습 시작 동기 가드', () => {
  it('복습 시작 버튼 연속 클릭해도 POST는 1회만 나간다', async () => {
    let resolveStart: (v: unknown) => void = () => {};
    const gate = new Promise<unknown>((r) => {
      resolveStart = r;
    });
    const counter = { n: 0 };
    renderReview(makeClient(gate, counter));
    const btn = await screen.findByRole('button', { name: /복습 시작/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(counter.n).toBe(1));
    expect(counter.n).toBe(1);
    await act(async () => {
      resolveStart({
        examId: 'saa-c03',
        mode: 'wrong',
        session: { status: 'active', cursor: 0, total: 5 },
        current: null,
        exhausted: true,
      });
    });
  });
});
