import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { useUiStore, type ApiClient } from '../../src/ui/session';
import { useStudyUiStore } from '../../src/ui/study/store';

function loggedInClient(): ApiClient {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  return {
    get: vi.fn(() => ({ json: async () => ({ user: { id } }) })),
    post: vi.fn(async () => new Response(null, { status: 204 })),
    patch: vi.fn(async () => ({ json: async () => ({ outcome: 'answered' }) })),
  } as unknown as ApiClient;
}

function renderApp(client: ApiClient) {
  window.history.replaceState(null, '', '/');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App client={client} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useUiStore.setState({ authBannerDismissed: false, logoutPending: false });
  useStudyUiStore.setState({
    view: 'start',
    scope: 'all',
    domainId: 'dom-security',
    index: 0,
    save: 'idle',
    confirmSubmit: false,
    confirmAbandon: false,
    historyPage: 1,
    detailId: null,
  });
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('홈 학습 진입', () => {
  it('로그인 시 10문제 학습 CTA와 이력 링크가 보인다', async () => {
    renderApp(loggedInClient());
    expect(await screen.findByRole('button', { name: '10문제 학습' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '학습 이력' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '계정' })).toBeInTheDocument();
    // 로그아웃은 계정 본문이 아니라 내비게이션 액션이다(#234)
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' }).closest('.moi-account')).toBeNull();
  });

  it('CTA를 누르면 학습 범위 화면이 열린다(지연 청크)', async () => {
    renderApp(loggedInClient());
    await screen.findByRole('button', { name: '10문제 학습' });
    fireEvent.click(screen.getByRole('button', { name: '10문제 학습' }));
    expect(await screen.findByText('학습 범위 선택')).toBeInTheDocument();
  });

  it('이력 링크를 누르면 이력 화면이 열린다', async () => {
    const client = {
      get: vi.fn((path: string) => ({
        json: async () => {
          if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
          return { user: { id: '123e4567-e89b-12d3-a456-426614174000' } };
        },
      })),
      post: vi.fn(async () => new Response(null, { status: 204 })),
      patch: vi.fn(),
    } as unknown as ApiClient;
    renderApp(client);
    await screen.findByRole('button', { name: '학습 이력' });
    fireEvent.click(screen.getByRole('button', { name: '학습 이력' }));
    await waitFor(() => expect(screen.getByText('완료한 학습')).toBeInTheDocument());
  });
});
