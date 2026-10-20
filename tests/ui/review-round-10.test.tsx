import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { ReviewScreen } from '../../src/ui/review/ReviewScreen';

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(new Response(JSON.stringify(body), { status }), new Request('http://localhost/api/test'), {} as never);
}

function clientWith(total: number): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        const u = new URL(String(path), 'http://localhost/');
        if (u.pathname === '/api/review/sessions/current') throw httpError(404, { error: 'not_found' });
        if (u.pathname === '/api/review/candidates') {
          return {
            examId: 'saa-c03', mode: 'wrong', total,
            items: Array.from({ length: total }, (_, i) => ({
              questionId: `q-${i}`, validWrongCount: 1, stem: `stem-${i}`,
              options: [{ optionId: 'o1', text: '보기 1' }],
            })),
          };
        }
        return {};
      },
    })),
    post: vi.fn(() => ({ json: async () => ({}) })),
    patch: vi.fn(() => ({ json: async () => ({}) })),
  } as unknown as ApiClient;
}

function renderScreen(client: ApiClient) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/review?mode=wrong']}>
        <Routes><Route path="/review" element={<ReviewScreen client={client} />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('review 10문항 대기 UI (ADR-0059)', () => {
  it('후보 25 → 대기 25문제·stem 미노출·10문제 안내·시작 버튼 유지', async () => {
    renderScreen(clientWith(25));
    expect(await screen.findByText(/복습 대기 25문제/)).toBeInTheDocument();
    expect(screen.getByText(/10문제씩 진행됩니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /복습 시작/ })).toBeInTheDocument();
    expect(screen.queryByText('stem-0')).not.toBeInTheDocument();
    expect(screen.queryByText('q-0')).not.toBeInTheDocument();
  });

  it('빈 상태·로딩 후 시작 pending을 유지한다', async () => {
    const c = clientWith(0);
    renderScreen(c);
    expect(await screen.findByText(/복습할 오답이 없습니다/)).toBeInTheDocument();
    const start = screen.queryByRole('button', { name: /복습 시작/ });
    expect(start).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '북마크 복습' }));
  });
});
