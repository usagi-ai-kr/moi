import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { useUiStore, type ApiClient } from '../../src/ui/session';

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request('http://localhost/x'),
    {} as never,
  );
}

function loggedInClientWithHistory(total: number): ApiClient {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets')) {
          return { items: [], total };
        }
        return { user: { id } };
      },
    })),
    post: vi.fn(async () => new Response(null, { status: 204 })),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function loggedOutClient(): ApiClient {
  return {
    get: vi.fn(() => ({
      json: async () => {
        throw httpError(401, { error: 'unauthorized' });
      },
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function renderAt(client: ApiClient, url: string) {
  window.history.replaceState(null, '', url);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={queryClient}>
        <App client={client} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({ authBannerDismissed: false, logoutPending: false });
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('라우터·AppShell 내비게이션 (#148)', () => {
  it('로그인 시 상단 nav 4개와 aria-current를 보인다', async () => {
    renderAt(loggedInClientWithHistory(0), '/');
    const nav = await screen.findByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', '주요 메뉴');
    expect(screen.getByRole('link', { name: '학습 시작' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '학습 현황/이력' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '복습' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '계정' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '학습 시작' })).toHaveAttribute('aria-current', 'page');
  });

  it('AppShell 헤더는 320px 모바일에서도 브랜드와 4개 nav를 모두 노출하고 moi-shell-header를 갖는다', async () => {
    renderAt(loggedInClientWithHistory(0), '/review');
    const nav = await screen.findByRole('navigation');
    const header = nav.closest('header');
    expect(header).toHaveClass('moi-shell-header');
    expect(screen.getByRole('link', { name: 'moi' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '복습' })).toHaveAttribute('aria-current', 'page');

    const navLinks = screen.getAllByRole('link', { name: /학습 시작|학습 현황\/이력|복습|계정/ });
    expect(navLinks).toHaveLength(4);
    for (const link of navLinks) {
      expect(link).toHaveClass('moi-nav-link');
    }
  });

  it('/account 직접 진입: 계정 화면에 UUID/masked-id 없이 로그아웃만 있다', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    renderAt(loggedInClientWithHistory(0), '/account');
    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.queryByTestId('masked-id')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(id);
    expect(screen.getByRole('link', { name: '계정' })).toHaveAttribute('aria-current', 'page');
  });

  it('/history 0건: 빈 상태를 보이고 페이지 표기를 숨긴다', async () => {
    renderAt(loggedInClientWithHistory(0), '/history');
    expect(await screen.findByText(/아직 완료한 학습이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/전체/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '학습 현황/이력' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('nav 링크로 /history 이동이 동작한다', async () => {
    renderAt(loggedInClientWithHistory(0), '/');
    const link = await screen.findByRole('link', { name: '학습 현황/이력' });
    fireEvent.click(link);
    expect(await screen.findByText(/아직 완료한 학습이 없습니다/)).toBeInTheDocument();
  });

  it('로그아웃 상태에서는 nav를 숨기고 카카오 로그인을 보인다', async () => {
    renderAt(loggedOutClient(), '/');
    expect(await screen.findByRole('link', { name: '카카오 로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
  });

  it('로그아웃 상태의 /account 직접 진입에서도 nav를 숨긴다', async () => {
    renderAt(loggedOutClient(), '/account');
    expect(await screen.findByRole('link', { name: '카카오 로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
