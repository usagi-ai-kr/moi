import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/session';

const { brokenChunkError } = vi.hoisted(() => ({
  brokenChunkError:
    'ChunkLoadError: Loading chunk AuthenticatedApp failed at https://example.com/assets/AuthenticatedApp-123.js',
}));

vi.mock('../../src/ui/AuthenticatedApp', () => {
  return {
    default: () => {
      throw new Error(brokenChunkError);
    },
  };
});

describe('App 최상위 lazy 청크 로드 실패 (#132, #148)', () => {
  const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  });

  it('AuthenticatedApp import가 reject되면 라우터 없이도 오류 안내·새로고침·<a href="/">가 보이고 원문은 보이지 않는다', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { App } = await import('../../src/ui/App');

    const client = {
      get: vi.fn((path: string) => {
        if (String(path).includes('api/me')) {
          return { json: async () => ({ user: { id: 'test-user-id-123' } }) };
        }
        return { json: async () => ({ total: 0, items: [] }) };
      }),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // 라우터(MemoryRouter/BrowserRouter) 없이 렌더한다 (운영 main.tsx 환경과 동일)
    render(
      <QueryClientProvider client={queryClient}>
        <App client={client} />
      </QueryClientProvider>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('화면을 불러오지 못했습니다')).toBeInTheDocument();

    const reloadBtn = screen.getByRole('button', { name: '새로고침' });
    expect(reloadBtn).toBeInTheDocument();
    expect(reloadBtn).toHaveClass('moi-study-open');

    const homeLink = screen.getByRole('link', { name: '처음으로' });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveClass('moi-study-link');
    expect(homeLink).toHaveAttribute('href', '/');
    expect(homeLink.tagName.toLowerCase()).toBe('a');

    // 오류 메시지 원문·스택·URL은 화면에 노출되지 않음
    expect(screen.queryByText(new RegExp(brokenChunkError))).not.toBeInTheDocument();
    expect(screen.queryByText(/ChunkLoadError/)).not.toBeInTheDocument();
    expect(screen.queryByText(/https:\/\/example\.com/)).not.toBeInTheDocument();

    fireEvent.click(reloadBtn);
    expect(reloadMock).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
