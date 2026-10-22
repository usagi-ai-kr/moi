import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HTTPError } from 'ky';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyStats } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { HistoryPage } from '../../src/ui/pages/HistoryPage';

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request('http://localhost/x'),
    {} as never,
  );
}

// 응답에 2개 영역만 포함 — 나머지 2개는 표시 모델에서 데이터 부족 카드가 된다 (AC-8).
const STATS: StudyStats = {
  examId: 'saa-c03',
  totalQuestions: 500,
  uniqueFirstSolved: 20,
  coverage: 0.04,
  overallAccuracy: 0.7,
  domains: [
    {
      domainId: 'dom-security',
      uniqueFirstSolved: 8,
      gradedAttempts: 10,
      cumulativeAccuracy: 0.8,
      recentAccuracy: 0.9,
      status: 'ok',
    },
    {
      domainId: 'dom-resilience',
      uniqueFirstSolved: 0,
      gradedAttempts: 0,
      cumulativeAccuracy: null,
      recentAccuracy: null,
      status: 'insufficient-data',
    },
  ],
  weakDomains: [
    {
      domainId: 'dom-resilience',
      score: 0.2,
      cumulativeAccuracy: 0.3,
      effectiveRecentAccuracy: 0.3,
      uniqueFirstSolved: 0,
    },
  ],
};

interface MockOpts {
  total: number;
  stats?: StudyStats | null;
  statsFail?: boolean;
  historyFail?: boolean;
}

function makeMockClient(opts: MockOpts) {
  const calls: string[] = [];
  let currentTotal = opts.total;
  let historyFail = opts.historyFail ?? false;
  const client = {
    get: vi.fn((path: string) => ({
      json: async () => {
        calls.push(String(path));
        if (String(path).startsWith('api/study/stats')) {
          if (opts.statsFail) throw httpError(500, { error: 'server_error' });
          if (opts.stats === null) throw httpError(500, { error: 'server_error' });
          return opts.stats ?? STATS;
        }
        if (String(path).startsWith('api/study/sets')) {
          if (historyFail) throw httpError(500, { error: 'server_error' });
          const u = new URL(String(path), 'http://localhost/');
          const page = Number(u.searchParams.get('page') ?? '1');
          const pageSize = Number(u.searchParams.get('pageSize') ?? '20');
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
        throw new Error(`Unexpected path: ${path}`);
      },
    })),
  } as unknown as ApiClient;
  const statsCalls = () => calls.filter((p) => p.startsWith('api/study/stats')).length;
  const setsCalls = () => calls.filter((p) => p.startsWith('api/study/sets')).length;
  return { client, calls, statsCalls, setsCalls, setTotal: (t: number) => { currentTotal = t; }, setHistoryFail: (f: boolean) => { historyFail = f; } };
}

function LocationProbe({ onLocation }: { onLocation: (loc: { pathname: string; search: string }) => void }) {
  const loc = useLocation();
  onLocation(loc);
  return null;
}

function NavigationControls({ onControls }: { onControls: (ctrl: { back: () => void; forward: () => void }) => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    onControls({ back: () => navigate(-1), forward: () => navigate(1) });
  }, [navigate, onControls]);
  return null;
}

function renderHistory(
  client: ApiClient,
  initialEntry = '/history',
  opts?: {
    onLocation?: (loc: { pathname: string; search: string }) => void;
    onControls?: (ctrl: { back: () => void; forward: () => void }) => void;
    queryClient?: QueryClient;
  },
) {
  const queryClient = opts?.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

function tab(name: string): HTMLElement {
  return screen.getByRole('tab', { name });
}

function activePanel(): HTMLElement {
  return screen.getByRole('tabpanel');
}

// 포커스가 선택된 탭과 일치하는지 (최종 상태) 확인한다.
function expectFocusOnSelectedTab(): void {
  const selected = screen
    .getAllByRole('tab')
    .find((t) => t.getAttribute('aria-selected') === 'true');
  expect(selected).toBeDefined();
  expect(document.activeElement).toBe(selected);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('history 하위 탭 기본 렌더 (AC-1)', () => {
  it('/history 진입 시 기본 탭 summary가 활성이고 요약만 보인다', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistory(client, '/history');

    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: copy.history.tablistLabel })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(tab(copy.history.tabSummary)).toHaveAttribute('aria-selected', 'true');
    expect(tab(copy.history.tabDomains)).toHaveAttribute('aria-selected', 'false');
    expect(tab(copy.history.tabCompleted)).toHaveAttribute('aria-selected', 'false');
    // 요약만 노출 — 분석(취약 추천)·완료 목록은 패널에 없다.
    const panel = activePanel();
    expect(within(panel).queryByText(copy.stats.weakTitle)).not.toBeInTheDocument();
    expect(within(panel).queryByText(copy.study.historyTitle)).not.toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeNull();
    expect(screen.queryAllByRole('tabpanel')).toHaveLength(1);
  });
});

describe('history 탭 직접 진입·정규화 (AC-2·AC-3)', () => {
  it('?tab=domains 직접 진입 시 분석 탭이 활성이다', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistory(client, '/history?tab=domains');

    expect(tab(copy.history.tabDomains)).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(copy.stats.domainsTitle)).toBeInTheDocument();
  });

  it('?tab=completed 직접 진입 시 완료 탭 + 페이지 데이터다', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistory(client, '/history?tab=completed');

    expect(tab(copy.history.tabCompleted)).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('총 5건')).toBeInTheDocument();
  });

  it('잘못된 ?tab=unknown은 summary로 replace한다', async () => {
    let currentLoc = { pathname: '', search: '' };
    const { client } = makeMockClient({ total: 5 });
    renderHistory(client, '/history?tab=unknown', { onLocation: (loc) => { currentLoc = loc; } });

    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    await waitFor(() => {
      expect(currentLoc.search).toContain('tab=summary');
      expect(tab(copy.history.tabSummary)).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('?page=2만 있으면 completed로 해석하고 ?tab=completed를 replace한다', async () => {
    let currentLoc = { pathname: '', search: '' };
    const { client } = makeMockClient({ total: 45 });
    renderHistory(client, '/history?page=2', { onLocation: (loc) => { currentLoc = loc; } });

    expect(await screen.findByText('현재 2 / 전체 3')).toBeInTheDocument();
    await waitFor(() => {
      expect(currentLoc.search).toContain('tab=completed');
      expect(tab(copy.history.tabCompleted)).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('요약 탭에서 잘못된 page는 URL을 건드리지 않는다 (숨은 탭 격리)', async () => {
    let currentLoc = { pathname: '', search: '' };
    const mock = makeMockClient({ total: 5 });
    renderHistory(mock.client, '/history?tab=summary&page=abc', { onLocation: (loc) => { currentLoc = loc; } });

    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    // page 보정 효과의 입력(서버 total)은 completed 탭의 이력 조회에만 존재한다.
    // 이력 조회가 발생하지 않았음을 양수 조건으로 확인하면 대기 없이 격리를 증명할 수 있다.
    await waitFor(() => {
      expect(mock.setsCalls()).toBe(0);
      expect(tab(copy.history.tabSummary)).toHaveAttribute('aria-selected', 'true');
    });
    expect(currentLoc.search).toContain('page=abc');
    expect(currentLoc.search).toContain('tab=summary');
  });
});

describe('history 탭 이동 push·뒤로가기·page 보존 (AC-4)', () => {
  it('탭 이동은 push이며 뒤로/앞으로가기로 탭이 복원되고 page가 보존된다', async () => {
    let currentLoc = { pathname: '', search: '' };
    let controls: { back: () => void; forward: () => void } | undefined;
    const { client } = makeMockClient({ total: 45 });
    renderHistory(client, '/history?tab=completed&page=2', {
      onLocation: (loc) => { currentLoc = loc; },
      onControls: (ctrl) => { controls = ctrl; },
    });

    expect(await screen.findByText('현재 2 / 전체 3')).toBeInTheDocument();

    fireEvent.click(tab(copy.history.tabSummary));
    await waitFor(() => {
      expect(tab(copy.history.tabSummary)).toHaveAttribute('aria-selected', 'true');
      expect(currentLoc.search).toContain('tab=summary');
      expect(currentLoc.search).toContain('page=2');
    });

    controls?.back();
    await waitFor(() => {
      expect(tab(copy.history.tabCompleted)).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('현재 2 / 전체 3')).toBeInTheDocument();
    });

    controls?.forward();
    await waitFor(() => {
      expect(tab(copy.history.tabSummary)).toHaveAttribute('aria-selected', 'true');
    });
  });
});

describe('history 탭별 API 게이트·캐시 공유 (AC-5·AC-9)', () => {
  it('요약 탭에서는 sets 미발생, 완료 탭에서는 stats 미발생', async () => {
    const mock = makeMockClient({ total: 5 });
    renderHistory(mock.client, '/history');
    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    expect(mock.setsCalls()).toBe(0);

    const mock2 = makeMockClient({ total: 5 });
    const { unmount } = renderHistory(mock2.client, '/history?tab=completed');
    expect(await screen.findByText('총 5건')).toBeInTheDocument();
    expect(mock2.statsCalls()).toBe(0);
    unmount();
  });

  it('요약→분석 전환 시 캐시 신선 구간(≤30s)에 통계 재요청·스켈레톤 재노출이 없다', async () => {
    const mock = makeMockClient({ total: 5 });
    renderHistory(mock.client, '/history');
    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    expect(mock.statsCalls()).toBe(1);

    fireEvent.click(tab(copy.history.tabDomains));
    expect(await screen.findByText(copy.stats.domainsTitle)).toBeInTheDocument();
    expect(mock.statsCalls()).toBe(1);
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it('완료 탭 조회 실패는 해당 탭에만 오류+재시도를 보인다', async () => {
    const mock = makeMockClient({ total: 5, historyFail: true });
    renderHistory(mock.client, '/history?tab=completed');
    expect(await screen.findByText(/상태를 불러오지 못했습니다/)).toBeInTheDocument();

    mock.setHistoryFail(false);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('총 5건')).toBeInTheDocument();
  });
});

describe('history 숨은 탭 effect 격리 (AC-6)', () => {
  it('요약 탭에서는 서버 total 감소에도 URL page가 바뀌지 않고, 완료 탭에서만 보정된다', async () => {
    let currentLoc = { pathname: '', search: '' };
    const mock = makeMockClient({ total: 45 });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHistory(mock.client, '/history?tab=completed&page=2', {
      onLocation: (loc) => { currentLoc = loc; },
      queryClient,
    });

    expect(await screen.findByText('현재 2 / 전체 3')).toBeInTheDocument();

    // 요약 탭으로 전환 후 서버 축소 + 캐시 무효화 — 숨은 탭이 URL을 바꾸면 안 된다.
    fireEvent.click(tab(copy.history.tabSummary));
    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    const statsBefore = mock.statsCalls();
    const setsBefore = mock.setsCalls();
    mock.setTotal(15);
    await queryClient.invalidateQueries();

    // 무효화 후 통계 재조회가 끝났음을 양수 조건으로 확인한다 (음성 대기 제거).
    await waitFor(() => {
      expect(mock.statsCalls()).toBe(statsBefore + 1);
    });
    // 이력 조회는 완료 탭에서만 일어나므로 out-of-range 보정 입력 자체가 생기지 않는다.
    expect(mock.setsCalls()).toBe(setsBefore);
    expect(currentLoc.search).toContain('page=2');
    expect(currentLoc.search).not.toContain('page=1');

    // 완료 탭 복귀 시 정상 보정된다.
    fireEvent.click(tab(copy.history.tabCompleted));
    await waitFor(() => {
      expect(currentLoc.search).toContain('page=1');
      expect(screen.getByText('총 15건')).toBeInTheDocument();
    });
  });
});

describe('history 탭 키보드·접근성 (AC-7)', () => {
  it('ArrowRight/Left·Home/End로 이동·활성되고 roving tabindex·aria-selected가 동기화된다', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistory(client, '/history');

    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    const summary = tab(copy.history.tabSummary);
    const domains = tab(copy.history.tabDomains);
    const completed = tab(copy.history.tabCompleted);
    expect(summary).toHaveAttribute('tabindex', '0');
    expect(domains).toHaveAttribute('tabindex', '-1');

    summary.focus();
    fireEvent.keyDown(summary, { key: 'ArrowRight' });
    expect(domains).toHaveAttribute('aria-selected', 'true');
    expect(domains).toHaveAttribute('tabindex', '0');
    // 포커스는 선택 커밋 뒤로 이동한다 — 최종 상태에서 focus == aria-selected.
    expect(document.activeElement).toBe(domains);
    expectFocusOnSelectedTab();

    fireEvent.keyDown(domains, { key: 'ArrowLeft' });
    expect(summary).toHaveAttribute('aria-selected', 'true');
    expectFocusOnSelectedTab();

    fireEvent.keyDown(summary, { key: 'End' });
    expect(completed).toHaveAttribute('aria-selected', 'true');
    expectFocusOnSelectedTab();

    fireEvent.keyDown(completed, { key: 'Home' });
    expect(summary).toHaveAttribute('aria-selected', 'true');
    expectFocusOnSelectedTab();
  });

  it('비활성 탭은 dangling aria-controls를 갖지 않는다 (모든 참조가 실제 패널을 가리킨다)', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistory(client, '/history');
    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    // 활성 패널만 마운트되므로 aria-controls 는 선택 탭에만 존재한다.
    const withControls = tabs.filter((t) => t.getAttribute('aria-controls') !== null);
    expect(withControls).toHaveLength(1);
    expect(withControls[0]).toHaveAttribute('aria-selected', 'true');

    for (const t of tabs) {
      const controls = t.getAttribute('aria-controls');
      if (controls === null) {
        expect(t).toHaveAttribute('aria-selected', 'false');
        continue;
      }
      const panel = document.getElementById(controls);
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', t.id);
    }
  });

  it('tabpanel은 tabIndex 0이며 aria-controls·aria-labelledby가 연결된다', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistory(client, '/history');
    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();

    const panel = activePanel();
    expect(panel).toHaveAttribute('tabindex', '0');
    const labelledBy = panel.getAttribute('aria-labelledby') ?? '';
    const tabEl = document.getElementById(labelledBy);
    expect(tabEl?.getAttribute('role')).toBe('tab');
    expect(tabEl?.getAttribute('aria-controls')).toBe(panel.id);
  });
});

describe('history 영역 4카드 표시 모델 (AC-8)', () => {
  it('응답에 없는 영역은 데이터 부족 + 학습 이력 없음 + — 이며 0%를 발명하지 않는다', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistory(client, '/history?tab=domains');
    expect(await screen.findByText(copy.stats.domainsTitle)).toBeInTheDocument();

    const panel = activePanel();
    // 4개 고정 카드 (복원력은 카드+취약 추천에 중복 노출될 수 있다)
    expect(within(panel).getByText('보안')).toBeInTheDocument();
    expect(within(panel).getAllByText('복원력').length).toBeGreaterThanOrEqual(1);
    expect(within(panel).getByText('성능')).toBeInTheDocument();
    expect(within(panel).getByText('비용 최적화')).toBeInTheDocument();
    // 실측 영역 유지
    expect(within(panel).getByText('표본 충분')).toBeInTheDocument();
    // 없는 영역 2개 (성능·비용 최적화)
    expect(within(panel).getAllByText(copy.history.noDomainHistory)).toHaveLength(2);
    expect(within(panel).getAllByText('데이터 부족').length).toBeGreaterThanOrEqual(2);
    // 지표 3칸 모두 — (없는 영역 2개 × 3 = 6). 0% 발명 금지.
    expect(within(panel).getAllByText('—')).toHaveLength(6);
    expect(within(panel).queryByText('0%')).not.toBeInTheDocument();
    // 없는 영역 카드(성능) 안에는 0문제를 쓰지 않는다 (실측 0인 복원력과 구분).
    const cards = Array.from(panel.querySelectorAll('.moi-domain-item'));
    const perfCard = cards.find((li) => li.textContent?.includes('성능'));
    expect(perfCard?.textContent).not.toContain('0문제');
  });

  it('정답률 설명 문구를 보인다', async () => {
    const { client } = makeMockClient({ total: 5 });
    renderHistory(client, '/history');
    expect(await screen.findByText(copy.history.accuracyNote)).toBeInTheDocument();
  });
});

describe('history 완료 탭 목록·빈 상태 (AC-10)', () => {
  it('0건이면 빈 안내 + 페이저 미노출, URL·UI에 UUID가 없다', async () => {
    let currentLoc = { pathname: '', search: '' };
    const { client } = makeMockClient({ total: 0 });
    renderHistory(client, '/history?tab=completed', { onLocation: (loc) => { currentLoc = loc; } });

    expect(await screen.findByText(/아직 완료한 학습이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '페이지네이션' })).not.toBeInTheDocument();
    expect(currentLoc.search + document.body.textContent).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});
