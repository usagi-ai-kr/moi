import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { StudyScreen } from '../../src/ui/study/StudyScreen';
import { useStudyUiStore } from '../../src/ui/study/store';

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(new Response(JSON.stringify(body), { status }), new Request('http://localhost/x'), {} as never);
}

function fakeHistoryClient(opts: { total?: number; fail?: boolean; unauth?: boolean } = {}): ApiClient {
  const total = opts.total ?? 3;
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (opts.fail) throw new TypeError('fetch failed');
        if (opts.unauth) throw httpError(401, { error: 'unauthorized' });
        if (String(path).startsWith('api/study/sets')) {
          const u = new URL(String(path), 'http://localhost/');
          const page = Number(u.searchParams.get('page') ?? '1');
          const pageSize = Number(u.searchParams.get('pageSize') ?? '20');
          const startIdx = (page - 1) * pageSize;
          const items = Array.from({ length: Math.max(0, Math.min(pageSize, total - startIdx)) }, (_, k) => {
            const i = startIdx + k;
            return {
              id: `set-h-${i}`,
              examId: 'saa-c03',
              mode: i % 2 === 0 ? 'all' : 'domain',
              domainId: i % 2 === 0 ? undefined : 'dom-security',
              submittedAt: 1700000000000 + i * 1000,
              correctCount: 12,
              accuracyPercent: 60,
            };
          });
          return { items, total };
        }
        throw httpError(404, { error: 'not_found' });
      },
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function renderHistory(client: ApiClient) {
  window.history.replaceState(null, '', '/');
  useStudyUiStore.setState({
    view: 'history',
    scope: 'all',
    domainId: 'dom-security',
    index: 0,
    save: 'idle',
    confirmSubmit: false,
    confirmAbandon: false,
    historyPage: 1,
    detailId: null,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudyScreen client={client} userId="user-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('학습 이력', () => {
  it('완료 세트 목록(날짜·모드·정답률)을 보인다', async () => {
    renderHistory(fakeHistoryClient({ total: 2 }));
    expect(await screen.findByText('완료한 학습')).toBeInTheDocument();
    const rows = await screen.findAllByText(/정답률 60%/);
    expect(rows).toHaveLength(2);
  });

  it('빈 이력은 안내 문구를 보인다', async () => {
    renderHistory(fakeHistoryClient({ total: 0 }));
    expect(await screen.findByText(/아직 완료한 학습이 없습니다/)).toBeInTheDocument();
  });

  it('페이지네이션으로 다음 페이지를 보인다', async () => {
    renderHistory(fakeHistoryClient({ total: 25 }));
    expect(await screen.findByText(/전체 25/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(screen.getByText(/2\/2/)).toBeInTheDocument());
  });

  it('상세 보기는 요약 상세를 열고 닫는다', async () => {
    renderHistory(fakeHistoryClient({ total: 1 }));
    const item = await screen.findByRole('button', { name: /정답률 60%/ });
    fireEvent.click(item);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('이력 로드 실패 시 오류와 다시 시도를 보인다', async () => {
    renderHistory(fakeHistoryClient({ fail: true }));
    expect(await screen.findByText(/상태를 불러오지 못했습니다/)).toBeInTheDocument();
  });
});
