import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { useUiStore, type ApiClient } from '../../src/ui/session';
import { MOBILE_NAV_QUERY } from '../../src/ui/responsive';

const { prefetchSpy } = vi.hoisted(() => ({ prefetchSpy: vi.fn() }));

vi.mock('../../src/ui/lazy-routes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/lazy-routes')>();
  return { ...actual, prefetchRoute: prefetchSpy };
});

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

/** 로그아웃이 실패(403)하는 클라이언트 — nav 액션의 오류·재시도를 검증한다. */
function logoutFailingClient(): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
        return { user: { id: '123e4567-e89b-12d3-a456-426614174000', createdAt: 1_700_000_000, lastLoginAt: 1_700_100_000 } };
      },
    })),
    post: vi.fn(async () => {
      throw httpError(403, { error: 'forbidden' });
    }),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

/** 로그아웃 응답이 끝나지 않는 클라이언트 — pending 상태를 검증한다. */
function logoutHangingClient(): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
        return { user: { id: '123e4567-e89b-12d3-a456-426614174000', createdAt: 1_700_000_000, lastLoginAt: 1_700_100_000 } };
      },
    })),
    post: vi.fn(() => new Promise<Response>(() => {})),
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

/** 데스크톱(≥768px) 구간 — 가로 nav가 노출되는 컨텍스트 (#215). */
function useDesktopViewport(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query !== MOBILE_NAV_QUERY,
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

  it('AppShell 헤더는 moi-shell-header를 갖고 브랜드와 현재 위치 링크를 노출한다', async () => {
    renderAt(loggedInClientWithHistory(0), '/review');
    const nav = await screen.findByRole('navigation');
    const header = nav.closest('header');
    expect(header).toHaveClass('moi-shell-header');
    expect(screen.getByRole('link', { name: 'moi' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '복습' })).toHaveAttribute('aria-current', 'page');
  });

  it('가로 nav 4개는 데스크톱 구간에서만 노출된다 (#215)', async () => {
    // jsdom의 matchMedia는 매칭되지 않으므로 데스크톱 구간을 명시한다.
    useDesktopViewport();
    renderAt(loggedInClientWithHistory(0), '/review');
    const nav = await screen.findByRole('navigation', { name: '주요 메뉴' });
    expect(nav).not.toHaveAttribute('hidden');

    const navLinks = screen.getAllByRole('link', { name: /학습 시작|학습 현황\/이력|복습|계정/ });
    expect(navLinks).toHaveLength(4);
    for (const link of navLinks) {
      expect(link).toHaveClass('moi-nav-link');
    }
    expect(screen.queryByRole('button', { name: '메뉴 열기' })).not.toBeInTheDocument();
  });

  it('데스크톱 헤더의 시험 selector는 1개만 있고 접근 이름이 "시험"이다 (#239)', async () => {
    useDesktopViewport();
    renderAt(loggedInClientWithHistory(0), '/');
    const select = await screen.findByRole('combobox', { name: '시험' });
    expect(select).toBeEnabled();
    expect(screen.getAllByRole('combobox', { name: '시험' })).toHaveLength(1);
    // 옵션은 현재 지원 시험 1개 — 시험 추가 시 목록만 늘어난다.
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'AWS SAA-C03' })).toBeInTheDocument();
  });

  it('/account 직접 진입: 계정 정보는 보이지만 내부 ID·로그아웃 버튼은 없다 (#234)', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    renderAt(loggedInClientWithHistory(0), '/account');
    expect(await screen.findByRole('heading', { level: 1, name: '계정' })).toBeInTheDocument();
    expect(screen.getByText('가입일')).toBeInTheDocument();
    expect(screen.getByText('최근 로그인')).toBeInTheDocument();
    expect(screen.getByText('로그인 방식')).toBeInTheDocument();
    // 내부 식별자·마스킹 id는 화면(aria-label 포함)에 노출하지 않는다
    expect(screen.queryByTestId('masked-id')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(id);
    for (const el of Array.from(document.querySelectorAll('[aria-label]'))) {
      expect(el.getAttribute('aria-label')).not.toContain(id);
    }
    // 로그아웃은 내비게이션 액션 — 계정 본문에는 없다
    const logoutButtons = screen.getAllByRole('button', { name: '로그아웃' });
    expect(logoutButtons.length).toBeGreaterThan(0);
    for (const button of logoutButtons) {
      expect(button.closest('.moi-account')).toBeNull();
    }
    expect(screen.getByRole('link', { name: '계정' })).toHaveAttribute('aria-current', 'page');
  });

  it('/history 0건: 완료 탭에서 빈 상태를 보이고 페이지 표기를 숨긴다 (#224 AC 1 — 기본 탭 변경)', async () => {
    renderAt(loggedInClientWithHistory(0), '/history?tab=completed');
    expect(await screen.findByText(/아직 완료한 학습이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/전체/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '학습 현황/이력' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('nav 링크로 /history 이동 시 요약 탭이 열린다 (#224 AC 1 — 목록은 완료 탭)', async () => {
    renderAt(loggedInClientWithHistory(0), '/');
    const link = await screen.findByRole('link', { name: '학습 현황/이력' });
    fireEvent.click(link);
    expect(await screen.findByRole('tab', { name: '학습 현황' })).toBeInTheDocument();
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

  it('nav 링크 hover/focus/touch 시 해당 라우트 청크를 prefetch한다 (#184)', async () => {
    renderAt(loggedInClientWithHistory(0), '/');
    const history = await screen.findByRole('link', { name: '학습 현황/이력' });
    const review = screen.getByRole('link', { name: '복습' });
    const account = screen.getByRole('link', { name: '계정' });

    fireEvent.mouseEnter(history);
    fireEvent.focus(review);
    fireEvent.touchStart(account);

    expect(prefetchSpy).toHaveBeenCalledWith('/history');
    expect(prefetchSpy).toHaveBeenCalledWith('/review');
    expect(prefetchSpy).toHaveBeenCalledWith('/account');
  });
});

describe('내비게이션 로그아웃 액션 (#234/ADR-0072)', () => {
  it('로그아웃은 이동 링크가 아니라 실제 액션 버튼이다', async () => {
    useDesktopViewport();
    renderAt(loggedInClientWithHistory(0), '/');
    const button = await screen.findByRole('button', { name: '로그아웃' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    // 메뉴 링크와 달리 현재 위치 표시(aria-current)를 갖지 않는다
    expect(button).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('link', { name: '로그아웃' })).not.toBeInTheDocument();
  });

  it('로그아웃 pending 동안은 disabled + aria-busy다', async () => {
    useDesktopViewport();
    renderAt(logoutHangingClient(), '/');
    const button = await screen.findByRole('button', { name: '로그아웃' });
    fireEvent.click(button);

    const pending = await screen.findByRole('button', { name: /로그아웃하고 있습니다/ });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
  });

  it('로그아웃 실패: role=alert 안내와 재시도 버튼이 같은 위치에 보인다', async () => {
    useDesktopViewport();
    renderAt(logoutFailingClient(), '/');
    const button = await screen.findByRole('button', { name: '로그아웃' });
    fireEvent.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('로그아웃하지 못했습니다.');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('로그아웃 성공: 세션을 버리고 비로그인 화면으로 전환된다', async () => {
    useDesktopViewport();
    let loggedOut = false;
    const client = {
      get: vi.fn((path: string) => ({
        json: async () => {
          if (loggedOut) throw httpError(401, { error: 'unauthorized' });
          if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
          return { user: { id: '123e4567-e89b-12d3-a456-426614174000', createdAt: 1_700_000_000, lastLoginAt: 1_700_100_000 } };
        },
      })),
      post: vi.fn(async () => {
        loggedOut = true;
        return new Response(null, { status: 204 });
      }),
      patch: vi.fn(),
    } as unknown as ApiClient;

    renderAt(client, '/');
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));

    expect(await screen.findByRole('link', { name: '카카오 로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
  });
});
