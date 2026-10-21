// #215 — 모바일 햄버거·우측 Drawer 계약 (RTL). jsdom에 showModal/close가 없어
// feature-detect 폴백 경로로 실제 상태·포커스·스크롤 잠금 로직을 검증한다 (ADR-0057).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { MOBILE_NAV_QUERY } from '../../src/ui/responsive';
import { useUiStore, type ApiClient } from '../../src/ui/session';

const MENU_LABELS = /학습 시작|학습 현황\/이력|복습|계정/;

/** 401 시뮬레이션용 ky HTTPError — getMe의 401→null 매핑을 그대로 검증한다. */
function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request('http://localhost/api/me'),
    {} as never,
  );
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

/** 모바일(≤767px) 구간을 흉내내는 matchMedia 오버라이드 — 케이스별로만 적용한다. */
function useViewport(mobile: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === MOBILE_NAV_QUERY ? mobile : false,
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

function renderAt(url: string) {
  window.history.replaceState(null, '', url);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={queryClient}>
        <App client={loggedInClient()} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({ authBannerDismissed: false, logoutPending: false });
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('모바일 Drawer — 트리거·메뉴 노출 (#215)', () => {
  it('모바일 구간: 햄버거 트리거가 보이고 aria-expanded/aria-controls를 갖는다', async () => {
    useViewport(true);
    renderAt('/');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'moi-mobile-nav');
  });

  it('모바일 구간: 가로 nav 링크는 키보드·AT 탐색 대상에 남지 않는다', async () => {
    useViewport(true);
    renderAt('/');
    await screen.findByRole('button', { name: '메뉴 열기' });
    expect(screen.queryByRole('link', { name: '복습' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).not.toBeInTheDocument();
    // DOM에는 남아 있지만 hidden 처리되어 포커스 순서에서 제외된다.
    expect(document.querySelector('nav.moi-nav')).toHaveAttribute('hidden');
  });

  it('데스크톱 구간: 가로 nav 4개가 보이고 햄버거 트리거는 없다', async () => {
    useViewport(false);
    renderAt('/');
    expect(await screen.findByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: MENU_LABELS })).toHaveLength(4);
    expect(screen.queryByRole('button', { name: '메뉴 열기' })).not.toBeInTheDocument();
  });

  it('모바일 구간: Drawer를 열면 4개 메뉴만 보이고 현재 위치가 표시된다', async () => {
    useViewport(true);
    renderAt('/review');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('id', 'moi-mobile-nav');
    expect(screen.getAllByRole('link', { name: MENU_LABELS })).toHaveLength(4);
    expect(screen.getByRole('link', { name: '복습' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '계정' })).not.toHaveAttribute('aria-current');
  });

  it('시험 selector는 Drawer에 없고 콘텐츠 최상단에 있다 — 열어도 1개, 접근 이름이 "시험"이다 (#239·#273)', async () => {
    useViewport(true);
    const { container } = renderAt('/');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    // 닫힌 상태에서도 콘텐츠 최상단 selector 1개가 있다.
    expect(await screen.findByRole('combobox', { name: '시험' })).toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: '시험' })).toHaveLength(1);
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    const select = await screen.findByRole('combobox', { name: '시험' });
    expect(select).toBeEnabled();
    expect(screen.getAllByRole('combobox', { name: '시험' })).toHaveLength(1);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    // Drawer 안에는 selector가 없다.
    expect(dialog.querySelector('select.moi-exam-select')).toBeNull();
    expect(container.querySelector('dialog .moi-exam-select')).toBeNull();
  });
});

describe('모바일 Drawer — 닫기·포커스·스크롤 잠금 (#215)', () => {
  it('Escape로 닫히고 트리거로 포커스가 돌아온다', async () => {
    useViewport(true);
    renderAt('/');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('닫기 버튼으로 닫히고 포커스가 트리거로 돌아온다', async () => {
    useViewport(true);
    renderAt('/');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('button', { name: '메뉴 닫기' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('백드롭(다이얼로그 바깥) 클릭으로 닫히고 패널 내부 클릭으로는 닫히지 않는다', async () => {
    useViewport(true);
    renderAt('/');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('navigation', { name: '주요 메뉴' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('메뉴를 선택하면 닫히고 경로가 이동한다', async () => {
    useViewport(true);
    renderAt('/');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('link', { name: '계정' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { level: 1, name: '계정' })).toBeInTheDocument();
  });

  it('경로가 바뀌면 Drawer가 자동으로 닫힌다', async () => {
    useViewport(true);
    renderAt('/review');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    fireEvent.click(trigger);
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('link', { name: 'moi' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('열 때 배경 스크롤을 잠그고 닫으면 원복한다', async () => {
    useViewport(true);
    renderAt('/');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });

    fireEvent.click(trigger);
    expect(document.documentElement.style.overflow).toBe('hidden');

    fireEvent.click(await screen.findByRole('button', { name: '메뉴 닫기' }));
    await waitFor(() => expect(document.documentElement.style.overflow).toBe(''));
  });

  it('Drawer 메뉴 항목은 기존 4개와 동일하다(미구현 기능 미노출)', async () => {
    useViewport(true);
    renderAt('/');
    const trigger = await screen.findByRole('button', { name: '메뉴 열기' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');

    const items = Array.from(dialog.querySelectorAll('.moi-drawer-link')).map((el) => el.textContent);
    expect(items).toEqual(['학습 시작', '학습 현황/이력', '복습', '계정']);
  });
});

describe('모바일 Drawer — 로그아웃 액션 (#234/ADR-0072)', () => {
  it('Drawer 안의 로그아웃은 이동 링크가 아니라 액션 버튼이다', async () => {
    useViewport(true);
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: '메뉴 열기' }));
    const dialog = await screen.findByRole('dialog');

    const button = within(dialog).getByRole('button', { name: '로그아웃' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).not.toHaveAttribute('aria-current');
    // 메뉴 링크 4개는 그대로 — 로그아웃은 링크로 세지지 않는다
    expect(within(dialog).getAllByRole('link')).toHaveLength(4);
  });

  it('Drawer 로그아웃 성공: Drawer가 닫히고 비로그인 화면이 된다', async () => {
    useViewport(true);
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

    window.history.replaceState(null, '', '/');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/']}>
        <QueryClientProvider client={queryClient}>
          <App client={client} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '메뉴 열기' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('link', { name: '카카오 로그인' })).toBeInTheDocument();
  });

  it('Drawer 로그아웃 실패: role=alert 안내와 재시도 버튼이 보인다', async () => {
    useViewport(true);
    const client = {
      get: vi.fn((path: string) => ({
        json: async () => {
          if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
          return { user: { id: '123e4567-e89b-12d3-a456-426614174000', createdAt: 1_700_000_000, lastLoginAt: 1_700_100_000 } };
        },
      })),
      post: vi.fn(async () => {
        throw new Error('network');
      }),
      patch: vi.fn(),
    } as unknown as ApiClient;

    window.history.replaceState(null, '', '/');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/']}>
        <QueryClientProvider client={queryClient}>
          <App client={client} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '메뉴 열기' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '로그아웃' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('로그아웃하지 못했습니다.');
    expect(within(dialog).getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
