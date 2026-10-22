// #301 계정 화면 시험 selector 숨김 — 경로 기반 조건부 렌더.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { isExamScopedPath } from '../../src/ui/AppShell';
import { useUiStore, type ApiClient } from '../../src/ui/session';

function loggedInClient(): ApiClient {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
        if (String(path).startsWith('api/study/stats')) {
          return {
            examId: 'saa-c03',
            totalQuestions: 500,
            uniqueFirstSolved: 0,
            coverage: 0,
            overallAccuracy: 0,
            domains: [],
            weakDomains: [],
          };
        }
        if (String(path).startsWith('api/review/')) {
          if (String(path).includes('/sessions/current')) {
            throw Object.assign(new Error('not found'), { response: { status: 404 } });
          }
          return { examId: 'saa-c03', mode: 'wrong', total: 0, items: [] };
        }
        return { user: { id } };
      },
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      뒤로
    </button>
  );
}

function LocationView() {
  const location = useLocation();
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>;
}

function renderAppAt(url: string, withBack = false) {
  window.history.replaceState(null, '', url);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <App client={loggedInClient()} />
        {withBack ? <BackButton /> : null}
        <LocationView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useUiStore.setState({ authBannerDismissed: false, logoutPending: false });
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('#301 isExamScopedPath 순수 함수', () => {
  it.each(['/', '/study', '/study/new', '/study/abc', '/history', '/history', '/review', '/review/sub'])(
    '시험 범위 경로 %s → true',
    (pathname) => {
      expect(isExamScopedPath(pathname)).toBe(true);
    },
  );

  it.each(['/account', '/account/', '/login', '/study-new', '/studies', '', '/historyx'])(
    '범위 밖 경로 %s → false',
    (pathname) => {
      expect(isExamScopedPath(pathname)).toBe(false);
    },
  );
});

describe('#301 계정 화면 selector 숨김', () => {
  it('/account에서 combobox가 없고 래퍼도 없으며 계정 제목이 최상단이다', async () => {
    const { container } = renderAppAt('/account');
    expect(await screen.findByRole('heading', { level: 1, name: '계정' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '시험' })).toBeNull();
    expect(container.querySelector('.moi-content-exam')).toBeNull();
    // 계정 본문 UI는 그대로다.
    expect(screen.getByText('가입일')).toBeInTheDocument();
  });

  it.each(['/','/history', '/review', '/study/new'])('%s에서 selector 1개', async (url) => {
    renderAppAt(url);
    expect(await screen.findByRole('combobox', { name: '시험' })).toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: '시험' })).toHaveLength(1);
  });

  it('/account 경유 뒤로가기로 복귀해도 ?exam= 선택이 유지되고 selector가 돌아온다', async () => {
    renderAppAt('/study/new?exam=saa-c03', true);
    expect(await screen.findByRole('combobox', { name: '시험' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '계정' }));
    expect(await screen.findByRole('heading', { level: 1, name: '계정' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '시험' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('combobox', { name: '시험' })).toBeInTheDocument();
    expect(screen.getByTestId('loc').textContent).toBe('/study/new?exam=saa-c03');
    expect(screen.getByRole('combobox', { name: '시험' })).toHaveValue('saa-c03');
  });

  it('nav에는 selector가 없다(기존 계약 유지)', async () => {
    const { container } = renderAppAt('/account');
    await screen.findByRole('heading', { level: 1, name: '계정' });
    expect(container.querySelector('nav.moi-nav select.moi-exam-select')).toBeNull();
  });
});
