import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { ME_QUERY_KEY, useUiStore, type ApiClient } from '../../src/ui/session';

// 401 시뮬레이션용 ky HTTPError — getMe의 401→null 매핑을 그대로 검증한다.
function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request('http://localhost/api/me'),
    {} as never,
  );
}

interface Scenario {
  meStatus: number;
  meBody: unknown;
  logoutStatus?: number;
  hangLogout?: boolean;
}

function fakeClient(s: Scenario): ApiClient {
  return {
    get: vi.fn(() => ({
      json: async () => {
        if (s.meStatus >= 400) throw httpError(s.meStatus, s.meBody);
        return s.meBody;
      },
    })),
    post: vi.fn(async () => {
      if (s.hangLogout) return new Promise(() => {}) as Promise<Response>;
      const status = s.logoutStatus ?? 204;
      if (status >= 400) throw httpError(status, { error: 'forbidden' });
      return new Response(null, { status });
    }),
  } as unknown as ApiClient;
}

function renderApp(client: ApiClient, url = '/') {
  window.history.replaceState(null, '', url);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={queryClient}>
        <App client={client} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...utils, queryClient };
}

beforeEach(() => {
  useUiStore.setState({ authBannerDismissed: false, logoutPending: false });
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('App (세션 상태 화면)', () => {
  it('확인 중: role=status + aria-live=polite 로딩을 렌더링한다', async () => {
    const client = {
      get: vi.fn(() => ({ json: () => new Promise(() => {}) })),
      post: vi.fn(),
    } as unknown as ApiClient;
    renderApp(client);
    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('로딩 중: 정적 제목/소개 보임, 계정/학습/로그인 CTA 없음 (#132)', async () => {
    const client = {
      get: vi.fn(() => ({ json: () => new Promise(() => {}) })),
      post: vi.fn(),
    } as unknown as ApiClient;
    renderApp(client);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('moi');
    expect(screen.getAllByText('문제 중심 시험 대비 플랫폼').length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector('.moi-lead')).toHaveTextContent('문제 중심 시험 대비 플랫폼');
    expect(screen.getByText(/20문제 풀이.*저장.*결과.*AWS SAA/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '카카오 로그인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '20문제 학습' })).not.toBeInTheDocument();
    expect(screen.queryByText('내 계정')).not.toBeInTheDocument();
  });

  it('비로그인(401): 홈 + 카카오 로그인 버튼, 오류 아님', async () => {
    const client = fakeClient({ meStatus: 401, meBody: { error: 'unauthorized' } });
    renderApp(client);
    const link = await screen.findByRole('link', { name: '카카오 로그인' });
    expect(link).toHaveAttribute('href', '/auth/kakao');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('moi');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('로그인 홈: 계정/로그아웃을 상시 노출하지 않고 원본 id를 렌더하지 않는다', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const client = fakeClient({ meStatus: 200, meBody: { user: { id } } });
    renderApp(client, '/');
    expect(await screen.findByRole('button', { name: '20문제 학습' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '학습 시작' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '계정' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('masked-id')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(id);
    expect(document.body.textContent).not.toContain('123e');
  });

  it('계정 화면(/account): 로그아웃 버튼만 있고 UUID/masked-id가 없다', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const client = fakeClient({ meStatus: 200, meBody: { user: { id } } });
    renderApp(client, '/account');
    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.queryByTestId('masked-id')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(id);
    expect(document.body.textContent).not.toContain('123e');
    for (const el of Array.from(document.querySelectorAll('[aria-label]'))) {
      expect(el.getAttribute('aria-label')).not.toContain(id);
    }
  });

  it('오류/취소(?auth=error): 안전 메시지 + URL 정리 + 토큰 미노출', async () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const client = fakeClient({ meStatus: 401, meBody: { error: 'unauthorized' } });
    renderApp(client, '/?auth=error');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('다시 시도');
    await waitFor(() => {
      expect(window.location.search).not.toContain('auth=');
    });
    expect(replaceSpy).toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/token|paseto/i);
  });

  it('로그아웃 진행: loading/disabled + aria-busy, 완료 후 비로그인 + 캐시 제거', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    let loggedOut = false;
    let resolveLogout!: (v: Response) => void;
    const client = {
      get: vi.fn(() => ({
        json: async () => {
          if (loggedOut) throw httpError(401, { error: 'unauthorized' });
          return { user: { id } };
        },
      })),
      post: vi.fn(
        () =>
          new Promise<Response>((res) => {
            resolveLogout = (v: Response) => {
              loggedOut = true;
              res(v);
            };
          }),
      ),
    } as unknown as ApiClient;
    const { queryClient } = renderApp(client, '/account');
    const resetSpy = vi.spyOn(queryClient, 'resetQueries');
    const button = await screen.findByRole('button', { name: '로그아웃' });
    fireEvent.click(button);
    const pending = await screen.findByRole('button', { name: /로그아웃하고 있습니다/ });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    resolveLogout(new Response(null, { status: 204 }));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '카카오 로그인' })).toBeInTheDocument();
    });
    // stale 로그인 id가 남지 않고 서버 최신(null)으로 갱신된다
    expect(resetSpy).toHaveBeenCalledWith({ queryKey: ME_QUERY_KEY });
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull();
  });

  it('네트워크 오류: 오류 안내 + 다시 시도로 복구', async () => {
    let calls = 0;
    const client = {
      get: vi.fn(() => ({
        json: async () => {
          calls += 1;
          if (calls === 1) throw new TypeError('fetch failed');
          return { user: { id: 'abc1234567' } };
        },
      })),
      post: vi.fn(),
    } as unknown as ApiClient;
    renderApp(client);
    expect(await screen.findByText(/상태를 불러오지 못했습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '20문제 학습' })).toBeInTheDocument();
    });
    expect(calls).toBe(2);
  });

  it('브라우저 저장소에 토큰을 두지 않는다', async () => {
    const getItem = vi.spyOn(window.localStorage, 'getItem');
    const setItem = vi.spyOn(window.localStorage, 'setItem');
    const sessGet = vi.spyOn(window.sessionStorage, 'getItem');
    const sessSet = vi.spyOn(window.sessionStorage, 'setItem');
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const client = fakeClient({ meStatus: 200, meBody: { user: { id } } });
    renderApp(client);
    await screen.findByRole('button', { name: '20문제 학습' });
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(sessGet).not.toHaveBeenCalled();
    expect(sessSet).not.toHaveBeenCalled();
  });
});
