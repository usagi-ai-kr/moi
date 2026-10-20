import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HTTPError } from 'ky';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { HistoryPage } from '../../src/ui/pages/HistoryPage';

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request('http://localhost/x'),
    {} as never,
  );
}

function LocationProbe({ onLocation }: { onLocation: (loc: { pathname: string; search: string }) => void }) {
  const loc = useLocation();
  onLocation(loc);
  return null;
}

function NavigationControls({
  onControls,
}: {
  onControls: (ctrl: { back: () => void; forward: () => void }) => void;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    onControls({
      back: () => navigate(-1),
      forward: () => navigate(1),
    });
  }, [navigate, onControls]);
  return null;
}

interface MockOptions {
  total: number;
  fail?: boolean;
  delayMs?: number;
  itemsOverride?: Record<number, Array<{ id: string; submittedAt: number }>>;
}

function makeMockClient(opts: MockOptions) {
  const requestedPages: number[] = [];
  let shouldFail = opts.fail ?? false;
  let currentTotal = opts.total;

  const client = {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (opts.delayMs) {
          await new Promise((r) => setTimeout(r, opts.delayMs));
        }
        if (shouldFail && String(path).startsWith('api/study/sets')) {
          throw httpError(500, { error: 'server_error' });
        }
        if (String(path).startsWith('api/study/sets')) {
          const u = new URL(String(path), 'http://localhost/');
          const page = Number(u.searchParams.get('page') ?? '1');
          requestedPages.push(page);
          const pageSize = Number(u.searchParams.get('pageSize') ?? '20');

          if (opts.itemsOverride && opts.itemsOverride[page]) {
            return { items: opts.itemsOverride[page], total: currentTotal };
          }

          const startIdx = (page - 1) * pageSize;
          const count = Math.max(0, Math.min(pageSize, currentTotal - startIdx));
          const items = Array.from({ length: count }, (_, k) => {
            const i = startIdx + k;
            return {
              id: `set-uuid-${i}`,
              examId: 'saa-c03',
              mode: 'all',
              submittedAt: 1700000000000 + i * 1000,
              correctCount: 10,
              accuracyPercent: 50,
            };
          });
          return { items, total: currentTotal };
        }
        if (String(path).startsWith('api/study/stats')) {
          return { totalCompletedSets: currentTotal, overallAccuracyPercent: 50, domainAccuracies: [] };
        }
        throw new Error(`Unexpected path: ${path}`);
      },
    })),
  } as unknown as ApiClient;

  return {
    client,
    requestedPages,
    setFail: (f: boolean) => {
      shouldFail = f;
    },
    setTotal: (t: number) => {
      currentTotal = t;
    },
  };
}

function renderHistoryPage(
  client: ApiClient,
  initialEntry = '/history',
  opts?: {
    onLocation?: (loc: { pathname: string; search: string }) => void;
    onControls?: (ctrl: { back: () => void; forward: () => void }) => void;
    queryClient?: QueryClient;
  },
) {
  const queryClient =
    opts?.queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          {opts?.onLocation && <LocationProbe onLocation={opts.onLocation} />}
          {opts?.onControls && <NavigationControls onControls={opts.onControls} />}
          <Routes>
            <Route path="/history" element={<HistoryPage client={client} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('이력 페이지네이션 핵심 동작 (AC 1, AC 4)', () => {
  it('0건이면 nav(페이지네이션)를 렌더링하지 않고 빈 안내를 보인다', async () => {
    const { client } = makeMockClient({ total: 0 });
    renderHistoryPage(client, '/history');

    expect(await screen.findByText(/아직 완료한 학습이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '페이지네이션' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
  });

  it('1페이지(<= 20건)면 총건수만 노출되고 이전/다음 버튼과 현재/전체 표기는 없다', async () => {
    const { client } = makeMockClient({ total: 15 });
    renderHistoryPage(client, '/history');

    expect(await screen.findByText('총 15건')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
    expect(screen.queryByText(/현재.*전체/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1\/1/)).not.toBeInTheDocument();
  });

  it('45건에서 다음 클릭 시 서버 요청 page 2와 URL page=2가 일치한다', async () => {
    let currentLoc = { pathname: '', search: '' };
    const { client, requestedPages } = makeMockClient({ total: 45 });
    renderHistoryPage(client, '/history', {
      onLocation: (loc) => {
        currentLoc = loc;
      },
    });

    expect(await screen.findByText('총 45건')).toBeInTheDocument();
    expect(screen.getByText('현재 1 / 전체 3')).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: '다음' });
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(requestedPages).toContain(2);
      expect(screen.getByText('현재 2 / 전체 3')).toBeInTheDocument();
      expect(currentLoc.search).toContain('page=2');
    });
  });

  it('items 0건이지만 total > 0인 경우 빈 안내(emptyHistory)로 단정하지 않는다', async () => {
    const { client } = makeMockClient({
      total: 5,
      itemsOverride: { 1: [] },
    });
    renderHistoryPage(client, '/history');

    expect(await screen.findByText('총 5건')).toBeInTheDocument();
    expect(screen.queryByText(/아직 완료한 학습이 없습니다/)).not.toBeInTheDocument();
  });
});

describe('비동기 상태 및 오류/재시도 (AC 3)', () => {
  it('초기 로딩 시 nav를 숨기고 스켈레톤과 sr-only 로딩 문구를 표시한다', async () => {
    const { client } = makeMockClient({ total: 45, delayMs: 150 });
    renderHistoryPage(client, '/history');

    const history = screen.getByRole('region', { name: copy.study.historyTitle });
    expect(within(history).getByText(copy.common.loading)).toHaveClass('moi-sr-only');
    expect(history.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(screen.queryByRole('navigation', { name: '페이지네이션' })).not.toBeInTheDocument();

    expect(await screen.findByText('총 45건')).toBeInTheDocument();
    expect(history.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(screen.getByRole('navigation', { name: '페이지네이션' })).toBeInTheDocument();
  });

  it('조회 실패 시 nav를 숨기고 오류와 다시 시도를 노출하며, 재시도 시 복구된다', async () => {
    const mock = makeMockClient({ total: 45, fail: true });
    renderHistoryPage(mock.client, '/history');

    expect(await screen.findByText(/상태를 불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '페이지네이션' })).not.toBeInTheDocument();

    mock.setFail(false);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('총 45건')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '페이지네이션' })).toBeInTheDocument();
  });

  it('지연된 새 page 조회 중 이전 목록을 유지하고 nav를 aria-busy로 잠근다', async () => {
    let delay = 0;
    const { client } = makeMockClient({ total: 45 });
    const originalGet = client.get;
    client.get = vi.fn((path: string) => {
      const res = (originalGet as (p: string) => { json: () => Promise<unknown> })(path);
      return {
        json: async () => {
          if (delay > 0 && String(path).includes('page=2')) {
            await new Promise((r) => setTimeout(r, delay));
          }
          return res.json();
        },
      };
    }) as unknown as ApiClient['get'];

    renderHistoryPage(client, '/history');
    expect(await screen.findByText('총 45건')).toBeInTheDocument();

    delay = 200;
    const nextBtn = screen.getByRole('button', { name: '다음' });
    fireEvent.click(nextBtn);

    const nav = screen.getByRole('navigation', { name: '페이지네이션' });
    expect(nav).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    // background refetch는 기존 목록을 유지하고 스켈레톤으로 되돌리지 않는다 (#184).
    const history = screen.getByRole('region', { name: copy.study.historyTitle });
    expect(history).toHaveAttribute('aria-busy', 'true');
    expect(history.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(screen.getByText('총 45건')).toBeInTheDocument();

    await waitFor(() => {
      expect(nav).not.toHaveAttribute('aria-busy');
      expect(history).not.toHaveAttribute('aria-busy');
      expect(screen.getByText('현재 2 / 전체 3')).toBeInTheDocument();
    });
  });
});

describe('URL 동기화, 뒤로가기 및 잘못된 파라미터 보정 (AC 1, AC 2)', () => {
  it('URL page 직접 진입 시 해당 페이지 데이터를 요청한다', async () => {
    const { client, requestedPages } = makeMockClient({ total: 45 });
    renderHistoryPage(client, '/history?page=2');

    expect(await screen.findByText('총 45건')).toBeInTheDocument();
    expect(screen.getByText('현재 2 / 전체 3')).toBeInTheDocument();
    expect(requestedPages).toContain(2);
  });

  it('다음 페이지 이동 후 뒤로가기/앞으로가기 시 올바른 페이지와 URL로 복원된다 (AC 1)', async () => {
    let currentLoc = { pathname: '', search: '' };
    let controls: { back: () => void; forward: () => void } | undefined;
    const { client, requestedPages } = makeMockClient({ total: 45 });

    renderHistoryPage(client, '/history?page=1', {
      onLocation: (loc) => {
        currentLoc = loc;
      },
      onControls: (ctrl) => {
        controls = ctrl;
      },
    });

    expect(await screen.findByText('총 45건')).toBeInTheDocument();
    expect(screen.getByText('현재 1 / 전체 3')).toBeInTheDocument();

    // 다음 클릭 -> 2페이지
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => {
      expect(screen.getByText('현재 2 / 전체 3')).toBeInTheDocument();
      expect(currentLoc.search).toContain('page=2');
      expect(requestedPages).toContain(2);
    });

    // 뒤로가기 실행 -> 1페이지 복원
    controls?.back();
    await waitFor(() => {
      expect(screen.getByText('현재 1 / 전체 3')).toBeInTheDocument();
      expect(currentLoc.search).toContain('page=1');
    });

    // 앞으로가기 실행 -> 2페이지 복원
    controls?.forward();
    await waitFor(() => {
      expect(screen.getByText('현재 2 / 전체 3')).toBeInTheDocument();
      expect(currentLoc.search).toContain('page=2');
    });
  });

  it('정상적으로 다음 페이지 클릭 시 타 쿼리 파라미터(filter 등)를 보존한다', async () => {
    let currentLoc = { pathname: '', search: '' };
    const { client } = makeMockClient({ total: 45 });

    renderHistoryPage(client, '/history?filter=active', {
      onLocation: (loc) => {
        currentLoc = loc;
      },
    });

    expect(await screen.findByText('총 45건')).toBeInTheDocument();
    expect(screen.getByText('현재 1 / 전체 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    await waitFor(() => {
      expect(currentLoc.search).toContain('filter=active');
      expect(currentLoc.search).toContain('page=2');
      expect(screen.getByText('현재 2 / 전체 3')).toBeInTheDocument();
    });
  });

  it.each([
    ['0', '1'],
    ['-5', '1'],
    ['1.5', '1'],
    ['abc', '1'],
    ['9007199254740993', '1'],
  ])('잘못된 page=%s 유입 시 page=%s로 replace하고 타 param을 보존한다', async (rawPage, expectedPage) => {
    let currentLoc = { pathname: '', search: '' };
    const { client } = makeMockClient({ total: 45 });
    renderHistoryPage(client, `/history?filter=active&page=${rawPage}`, {
      onLocation: (loc) => {
        currentLoc = loc;
      },
    });

    expect(await screen.findByText('총 45건')).toBeInTheDocument();
    await waitFor(() => {
      expect(currentLoc.search).toContain('filter=active');
      expect(currentLoc.search).toContain(`page=${expectedPage}`);
      expect(screen.getByText('현재 1 / 전체 3')).toBeInTheDocument();
    });
  });

  it('page 2 체류 중 서버 total이 45에서 15로 감소하면 page 1로 자동 보정된다 (AC 2)', async () => {
    let currentLoc = { pathname: '', search: '' };
    const mock = makeMockClient({ total: 45 });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHistoryPage(mock.client, '/history?page=2', {
      onLocation: (loc) => {
        currentLoc = loc;
      },
      queryClient,
    });

    expect(await screen.findByText('총 45건')).toBeInTheDocument();
    expect(screen.getByText('현재 2 / 전체 3')).toBeInTheDocument();

    // 서버 total 축소 후 캐시 무효화
    mock.setTotal(15);
    await queryClient.invalidateQueries();

    await waitFor(() => {
      expect(currentLoc.search).toContain('page=1');
      expect(screen.getByText('총 15건')).toBeInTheDocument();
    });
  });
});

describe('상세 열림 및 페이지 전환/오류 격리 (AC 3, AC 5)', () => {
  it('상세 열기 시 UUID가 아닌 날짜 의미 라벨을 dialog에 노출한다', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistoryPage(client, '/history');

    const [itemBtn] = await screen.findAllByRole('button', { name: /정답률 50%/ });
    fireEvent.click(itemBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute('aria-label')).toContain('학습 상세');
    expect(dialog.getAttribute('aria-label')).not.toContain('set-uuid');
  });

  it('페이지 변경 시 열려 있던 상세가 자동으로 닫힌다', async () => {
    const { client } = makeMockClient({ total: 45 });
    renderHistoryPage(client, '/history');

    const [itemBtn] = await screen.findAllByRole('button', { name: /정답률 50%/ });
    fireEvent.click(itemBtn);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('상세 열림 상태에서 조회 실패 발생 시 dialog가 비노출된다 (AC 3)', async () => {
    const mock = makeMockClient({ total: 45 });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHistoryPage(mock.client, '/history', { queryClient });

    expect(await screen.findByText('총 45건')).toBeInTheDocument();
    const [itemBtn] = await screen.findAllByRole('button', { name: /정답률 50%/ });
    fireEvent.click(itemBtn);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // 조회 실패 설정 후 쿼리 무효화
    mock.setFail(true);
    await queryClient.invalidateQueries();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('이력 리스트 항목 버튼이 moi-study-history-item 클래스를 가진다', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistoryPage(client, '/history');

    const [itemBtn] = await screen.findAllByRole('button', { name: /정답률 50%/ });
    expect(itemBtn).toHaveClass('moi-study-history-item');
  });
});

