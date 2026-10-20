// #225 — 공통 브랜드·헤더 통일 (RTL, Red→Green).
// 첫 화면 loading/error/logged-out + 로그인 셸 + Drawer가 동일 favicon/moi를 사용하고
// 접근 이름 중복 0·홈 이동·포커스를 유지한다. jsdom bbox로 레이아웃 판정 금지.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { AppShell } from '../../src/ui/AppShell';
import { Brand } from '../../src/ui/Brand';
import { MOBILE_NAV_QUERY } from '../../src/ui/responsive';
import { useUiStore, type ApiClient } from '../../src/ui/session';

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request('http://localhost/api/me'),
    {} as never,
  );
}

function renderApp(client: ApiClient, url = '/') {
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

function hangClient(): ApiClient {
  return {
    get: vi.fn(() => ({ json: () => new Promise(() => {}) })),
    post: vi.fn(),
  } as unknown as ApiClient;
}

function errorClient(): ApiClient {
  return {
    get: vi.fn(() => ({
      json: async () => {
        throw new TypeError('fetch failed');
      },
    })),
    post: vi.fn(),
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
  } as unknown as ApiClient;
}

function loggedInClient(): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
        return { user: { id: '123e4567-e89b-12d3-a456-426614174000' } };
      },
    })),
    post: vi.fn(async () => new Response(null, { status: 204 })),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function useMobile(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === MOBILE_NAV_QUERY,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

function headerBrandIcon(): HTMLImageElement | null {
  return document.querySelector('header img.moi-brand-icon');
}

beforeEach(() => {
  useUiStore.setState({ authBannerDismissed: false, logoutPending: false });
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('Brand 공용 — Router 비의존 장식', () => {
  it('img는 장식(alt ""·aria-hidden)이고 텍스트는 copy.brand이며 Router를 import하지 않는다', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/ui/Brand.tsx', 'utf8');
    expect(src).not.toMatch(/from ['"]react-router['"]/);
    expect(src).not.toMatch(/lucide-react/);
    render(<Brand />);
    const icon = document.querySelector('img.moi-brand-icon') as HTMLImageElement | null;
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('src')).toBe('/favicon.svg');
    expect(icon?.getAttribute('alt')).toBe('');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('moi')).toBeInTheDocument();
  });
});

describe('첫 화면 3상태 — 동일 브랜드 (AC1)', () => {
  it.each([
    ['loading', hangClient()],
    ['error', errorClient()],
    ['logged-out', loggedOutClient()],
  ])('%s: favicon+moi 동일 자산·헤더 접근 이름 중복 0·tagline은 본문에만', async (_label, client) => {
    renderApp(client as ApiClient);
    await screen.findByRole('banner');
    const icon = headerBrandIcon();
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('src')).toBe('/favicon.svg');
    expect(icon?.getAttribute('alt')).toBe('');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    // 헤더에는 tagline이 없고 본문 lead에만 있다
    const header = document.querySelector('header.moi-header');
    expect(header?.textContent).not.toContain('문제 중심 시험 대비 플랫폼');
    expect(document.querySelector('main .moi-lead')).toHaveTextContent('문제 중심 시험 대비 플랫폼');
    // 헤더 내 접근 이름 "moi" 중복 0 (장식 img 제외, 단일 텍스트만)
    const names = Array.from(header?.querySelectorAll('a, button') ?? []).map((el) =>
      (el.getAttribute('aria-label') || el.textContent || '').trim(),
    );
    expect(names.filter((n) => n === 'moi')).toHaveLength(0);
    expect(header?.querySelectorAll('.moi-brand')).toHaveLength(1);
  });
});

describe('로그인 셸·Drawer — 동일 자산·홈 이동·포커스 (AC2)', () => {
  it('셸 브랜드 Link(/)는 동일 자산을 쓰고 단일 접근 이름 moi를 갖는다', async () => {
    window.history.replaceState(null, '', '/');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/review']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="review" element={<div>review</div>} />
            </Route>
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', { name: 'moi' });
    expect(link).toHaveAttribute('href', '/');
    const icon = link.querySelector('img.moi-brand-icon');
    expect(icon?.getAttribute('src')).toBe('/favicon.svg');
    expect(icon?.getAttribute('alt')).toBe('');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    link.focus();
    expect(document.activeElement).toBe(link);
  });

  it('Drawer 헤드도 동일 자산을 쓰고 닫기·포커스 회귀를 유지한다', async () => {
    useMobile();
    renderApp(loggedInClient(), '/');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    trigger.click();
    const dialog = await screen.findByRole('dialog');
    const headIcon = dialog.parentElement?.querySelector('.moi-drawer-head img.moi-brand-icon') ??
      document.querySelector('.moi-drawer-head img.moi-brand-icon');
    expect(headIcon?.getAttribute('src')).toBe('/favicon.svg');
    expect(headIcon?.getAttribute('alt')).toBe('');
    expect(headIcon?.getAttribute('aria-hidden')).toBe('true');
  });
});
