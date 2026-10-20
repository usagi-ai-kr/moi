import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import type { ApiClient, StudyActiveSet } from '../../src/ui/api/client';
import { HistoryDetailPage } from '../../src/ui/pages/HistoryDetailPage';
import { HistoryPage } from '../../src/ui/pages/HistoryPage';
import { LegacyHistoryRedirect } from '../../src/ui/pages/LegacyHistoryRedirect';
import { LegacyStudyRedirect } from '../../src/ui/pages/LegacyStudyRedirect';
import { StudyRoute } from '../../src/ui/pages/StudyRoute';
import type { StudySummary } from '../../src/ui/api/client';
import { useStudyUiStore } from '../../src/ui/study/store';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function httpError(status: number, body: unknown, url = 'http://localhost/x'): HTTPError {
  return new HTTPError(new Response(JSON.stringify(body), { status }), new Request(url), {} as never);
}

function makeSet(overrides?: Partial<StudyActiveSet>): StudyActiveSet {
  const items = Array.from({ length: 20 }, (_, i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`],
    stem: `문제 ${i} 본문: VPC와 서브넷 구성은?`,
    options: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`].map((id) => ({
      optionId: id,
      text: `보기 ${id} 내용`,
    })),
    response: { kind: 'unanswered' as const },
  }));
  return {
    id: 'set-1',
    userId: 'user-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'active',
    createdAt: 1700000000000,
    items,
    ...overrides,
  };
}

function submittedSet(): StudyActiveSet {
  const base = makeSet({ status: 'submitted', submittedAt: 1700000001000 });
  return {
    ...base,
    items: base.items.map((it, i) => ({
      ...it,
      explanation: `문제 ${i} 해설: 정답은 ${it.questionId}-a이다.`,
      sourceUrls: [`https://docs.aws.amazon.com/q-${i}`],
    })),
    result: {
      answeredCount: 1,
      correctCount: 1,
      accuracyPercent: 5,
      passCount: 1,
      unansweredCount: 18,
      perItem: base.items.map((it, i) => ({
        questionId: it.questionId,
        responseKind: i === 0 ? 'answered' : i === 1 ? 'pass' : 'unanswered',
        selectedOptionIds: i === 0 ? [`${it.questionId}-a`] : [],
        correctOptionIds: [`${it.questionId}-a`],
        correct: i === 0,
      })),
    },
  } as StudyActiveSet;
}

interface FakeOpts {
  start?: StudyActiveSet;
  startError?: number;
  get?: StudyActiveSet;
  /** 세트 ID별 응답 — 경로의 ID와 실제 조회 대상을 일치시켜 검증한다 (#171). */
  sets?: Record<string, StudyActiveSet>;
  current?: StudyActiveSet | null;
  currentError?: number;
  history?: { items: StudySummary[]; total: number };
}

function requestedSetId(path: string): string {
  return path.slice('api/study/sets/'.length).split('/')[0];
}

function fakeStudyClient(o: FakeOpts = {}): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        const p = String(path);
        if (p.includes('/corrections')) return { items: [] };
        if (p.startsWith('api/study/stats')) {
          return {
            totalAttempts: 0,
            recentAccuracyPercent: 0,
            overallAccuracyPercent: 0,
            weakestDomainId: null,
            byDomain: [],
          };
        }
        if (p.startsWith('api/study/sets/current')) {
          if (o.currentError) throw httpError(o.currentError, { error: 'internal' });
          if (o.current) return o.current;
          throw httpError(404, { error: 'no_active_set' });
        }
        if (p.startsWith('api/study/sets?')) {
          if (o.history) return o.history;
          return { items: [], total: 0 };
        }
        if (p === 'api/study/sets') {
          if (o.history) return o.history;
          return { items: [], total: 0 };
        }
        if (p.startsWith('api/study/sets/')) {
          if (o.sets) {
            const set = o.sets[requestedSetId(p)];
            if (!set) throw httpError(404, { error: 'not_found' });
            return set;
          }
          if (o.get) return o.get;
          if (o.current) return o.current;
          throw httpError(404, { error: 'not_found' });
        }
        throw httpError(404, { error: 'not_found' });
      },
    })),
    post: vi.fn((path: string) => ({
      json: async () => {
        if (String(path) === 'api/study/sets') {
          if (o.startError) throw httpError(o.startError, { error: 'active_set_exists' });
          return o.start ?? makeSet();
        }
        if (String(path).endsWith('/submit')) return submittedSet();
        if (String(path).endsWith('/abandon')) return makeSet({ status: 'abandoned' });
        throw httpError(404, { error: 'not_found' });
      },
    })),
    patch: vi.fn(() => ({ json: async () => ({ outcome: 'answered' }) })),
  } as unknown as ApiClient;
}

function requestedSetPaths(client: ApiClient): string[] {
  return vi
    .mocked(client.get)
    .mock.calls.map(([p]) => String(p))
    .filter((p) => p.startsWith('api/study/sets/') && !p.includes('/corrections'));
}

function resetStore() {
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
}

function LocationProbe() {
  const loc = useLocation();
  return (
    <>
      <p data-testid="location">{loc.pathname + loc.search}</p>
      <p data-testid="location-state">{JSON.stringify(loc.state ?? null)}</p>
    </>
  );
}

function renderStudyRoutes(client: ApiClient, initial: string | { pathname: string; state: unknown }) {
  resetStore();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/study" element={<StudyRoute client={client} userId="user-1" mode="current" />} />
          <Route path="/study/new" element={<StudyRoute client={client} userId="user-1" mode="start" />} />
          <Route path="/study/result" element={<StudyRoute client={client} userId="user-1" mode="result" />} />
          <Route path="/study/:setId" element={<LegacyStudyRedirect client={client} />} />
          <Route path="/study/:setId/result" element={<LegacyStudyRedirect client={client} />} />
          <Route path="/history" element={<p>history-list</p>} />
        </Routes>
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderHistoryRoutes(client: ApiClient, initial: string | { pathname: string; state: unknown }) {
  resetStore();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/history" element={<HistoryPage client={client} />} />
          <Route path="/history/detail" element={<HistoryDetailPage client={client} />} />
          <Route path="/history/:setId" element={<LegacyHistoryRedirect client={client} />} />
        </Routes>
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function expectNoSetIdInUrl() {
  const location = screen.getByTestId('location').textContent ?? '';
  expect(location).not.toMatch(UUID_RE);
  expect(location).not.toContain('set-1');
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('학습 라우트 분리 (#148)', () => {
  it('/study는 current 200이면 풀이 화면을 보이고 URL에 UUID가 없다', async () => {
    renderStudyRoutes(fakeStudyClient({ current: makeSet() }), '/study');
    expect(await screen.findByText(/1\/20/)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/study');
    expectNoSetIdInUrl();
  });

  it('/study 풀이 중 창 포커스가 돌아와도 풀이 화면을 다시 로딩하지 않는다', async () => {
    const client = fakeStudyClient({ current: makeSet() });
    const currentCalls = () =>
      vi.mocked(client.get).mock.calls.filter(([p]) => String(p).startsWith('api/study/sets/current')).length;
    renderStudyRoutes(client, '/study');
    expect(await screen.findByText(/1\/20/)).toBeInTheDocument();
    expect(currentCalls()).toBe(1);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(currentCalls()).toBe(1);
    expect(screen.getByText(/1\/20/)).toBeInTheDocument();
    focusManager.setFocused(undefined);
  });

  it('/study는 진행 중 세트가 없으면 /study/new로 이동한다', async () => {
    renderStudyRoutes(fakeStudyClient({ current: null }), '/study');
    expect(await screen.findByText('학습 범위 선택')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/study/new');
  });

  it('/study current 오류는 재시도 버튼을 보인다', async () => {
    renderStudyRoutes(fakeStudyClient({ currentError: 500 }), '/study');
    expect(await screen.findByText(/상태를 불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('/study/new 시작 성공 시 /study로 이동하고 풀이 화면 노드를 유지한다 (재마운트 방지)', async () => {
    renderStudyRoutes(fakeStudyClient({ start: makeSet(), current: makeSet() }), '/study/new');
    expect(await screen.findByText('학습 범위 선택')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    const questionNode = await screen.findByText(/1\/20/);
    expect(questionNode).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/study$/));
    await waitFor(() => expect(screen.getByTestId('location-state')).toHaveTextContent('null'));
    expect(questionNode.isConnected).toBe(true);
    expect(screen.getByText(/1\/20/)).toBe(questionNode);
    expectNoSetIdInUrl();
  });

  it('startedSetId state로 /study 진입 시 current가 404면 /study/new로 이동하고 state를 제거한다', async () => {
    renderStudyRoutes(
      fakeStudyClient({ current: null, get: makeSet() }),
      { pathname: '/study', state: { startedSetId: 'stale-set-id' } },
    );
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/study\/new$/));
    expect(await screen.findByText('학습 범위 선택')).toBeInTheDocument();
    expect(screen.queryByText(/1\/20/)).not.toBeInTheDocument();
    expect(screen.getByTestId('location-state')).toHaveTextContent('null');
  });

  it('시작 직후 current가 404를 돌려주면 /study/new로 replace한다', async () => {
    renderStudyRoutes(fakeStudyClient({ start: makeSet(), current: null }), '/study/new');
    expect(await screen.findByText('학습 범위 선택')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/study\/new$/));
    expect(await screen.findByText('학습 범위 선택')).toBeInTheDocument();
    expect(screen.getByTestId('location-state')).toHaveTextContent('null');
  });

  it('409면 이어풀기 버튼으로 /study에 복원한다', async () => {
    renderStudyRoutes(
      fakeStudyClient({ startError: 409, current: makeSet() }),
      '/study/new',
    );
    fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
    expect(await screen.findByText(/이미 진행 중인 세트/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이어풀기' }));
    expect(await screen.findByText(/1\/20/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/study$/));
  });

  it('제출 성공 시 /study/result로 이동하고 URL에 UUID가 없다', async () => {
    renderStudyRoutes(fakeStudyClient({ start: makeSet(), current: makeSet() }), '/study/new');
    fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/20/);
    fireEvent.click(screen.getByRole('button', { name: /제출하기/ }));
    fireEvent.click(await screen.findByRole('button', { name: '제출 확인' }));
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/study/result'));
    expectNoSetIdInUrl();
  });

  it('/study/result state가 없으면 /history로 이동한다', async () => {
    renderStudyRoutes(fakeStudyClient(), '/study/result');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history'));
    expect(await screen.findByText('history-list')).toBeInTheDocument();
  });

  it('/study/result state로 제출 세트를 복원한다', async () => {
    renderStudyRoutes(
      fakeStudyClient({ get: submittedSet() }),
      { pathname: '/study/result', state: { setId: 'set-1' } },
    );
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/study/result');
    expectNoSetIdInUrl();
  });

  it('레거시 /study/:id active는 /study로 replace한다', async () => {
    renderStudyRoutes(fakeStudyClient({ get: makeSet(), current: makeSet() }), '/study/set-1');
    expect(await screen.findByText(/1\/20/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/study$/));
  });

  it('레거시 /study/:id/result submitted는 /study/result로 replace한다', async () => {
    renderStudyRoutes(fakeStudyClient({ get: submittedSet() }), '/study/set-1/result');
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/study/result'));
    expectNoSetIdInUrl();
  });

  it('레거시 세트가 없으면 UUID 없이 안내와 복구 링크를 보인다', async () => {
    renderStudyRoutes(fakeStudyClient(), '/study/set-1');
    expect(await screen.findByText('학습 세트를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).not.toContain('set-1');
    expect(screen.getByRole('link', { name: '새 세트 시작' })).toHaveAttribute('href', '/study/new');
    expect(screen.getByRole('link', { name: '학습 이력' })).toHaveAttribute('href', '/history');
  });

  it('legacy /?study=id는 서버 확인 후 /study로 replace한다', async () => {
    const meId = 'user-1';
    const client = {
      get: vi.fn((path: string) => ({
        json: async () => {
          if (String(path).startsWith('api/study/sets/current')) return makeSet();
          if (String(path).startsWith('api/study/sets/')) return makeSet();
          if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
          return { user: { id: meId } };
        },
      })),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;
    resetStore();
    window.localStorage.clear();
    window.sessionStorage.clear();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/?study=set-1']}>
        <QueryClientProvider client={queryClient}>
          <App client={client} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/1\/20/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('set-1');
  });

  it('목록에서 상세로 이동 시 URL에 UUID가 없고 상세 내용을 표시한다', async () => {
    const summary = {
      id: 'set-1',
      examId: 'saa-c03',
      mode: 'all' as const,
      submittedAt: 1700000000000,
      correctCount: 10,
      accuracyPercent: 50,
    };
    const client = fakeStudyClient({
      sets: { 'set-1': submittedSet() },
      history: { items: [summary], total: 1 },
    });
    renderHistoryRoutes(client, '/history');

    const [itemBtn] = await screen.findAllByRole('button', { name: /정답률 50%/ });
    fireEvent.click(itemBtn);

    const detailLink = await screen.findByRole('link', { name: '상세 보기' });
    fireEvent.click(detailLink);

    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    expect(screen.getByText(/정답률 5%/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history/detail'));
    expectNoSetIdInUrl();
    expect(requestedSetPaths(client)).toEqual(['api/study/sets/set-1']);
  });

  it('/history/detail 직접 진입 시 state가 없으면 /history로 replace한다', async () => {
    const client = fakeStudyClient();
    renderHistoryRoutes(client, '/history/detail');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history'));
    expectNoSetIdInUrl();
  });

  it('레거시 /history/:id 본인 제출 세트는 /history/detail로 replace한다', async () => {
    const client = fakeStudyClient({ sets: { 'set-1': submittedSet() } });
    renderHistoryRoutes(client, '/history/set-1');
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    expect(screen.getByText(/정답률 5%/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history/detail'));
    expectNoSetIdInUrl();
    expect(requestedSetPaths(client)).toEqual(['api/study/sets/set-1']);
  });

  it('레거시 /history/:id 404/오류 시 UUID 없는 안내와 이력 링크를 보인다', async () => {
    const client = fakeStudyClient();
    renderHistoryRoutes(client, '/history/set-1');
    expect(await screen.findByText('학습 세트를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).not.toContain('set-1');
    expect(screen.getByRole('link', { name: '학습 이력' })).toHaveAttribute('href', '/history');
  });

  it('/history/detail 로딩 상태를 보인다', async () => {
    const client = {
      get: vi.fn(() => ({ json: () => new Promise(() => {}) })),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;
    renderHistoryRoutes(client, { pathname: '/history/detail', state: { setId: 'set-1' } });
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('/history/detail 오류 시 재시도와 돌아가기를 보인다', async () => {
    const client = {
      get: vi.fn(() => ({
        json: async () => {
          throw httpError(500, { error: 'internal' });
        },
      })),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;
    renderHistoryRoutes(client, { pathname: '/history/detail', state: { setId: 'set-1', page: 2 } });
    expect(await screen.findByText(/상태를 불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이력으로 돌아가기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이력으로 돌아가기' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history?page=2'));
  });

  it('상세에서 목록 복귀 시 원래 페이지 번호(?page=N)를 유지한다', async () => {
    const client = fakeStudyClient({ get: submittedSet() });
    renderHistoryRoutes(client, { pathname: '/history/detail', state: { setId: 'set-1', page: 2 } });
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이력으로 돌아가기' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history?page=2'));
  });

  it('목록에서 상세로 이동했다가 돌아오면 원래 페이지 번호(?page=N)를 유지한다', async () => {
    const summary = {
      id: 'set-1',
      examId: 'saa-c03',
      mode: 'all' as const,
      submittedAt: 1700000000000,
      correctCount: 10,
      accuracyPercent: 50,
    };
    const client = fakeStudyClient({
      sets: { 'set-1': submittedSet() },
      history: { items: [summary], total: 21 },
    });
    renderHistoryRoutes(client, '/history?page=2');

    const [itemBtn] = await screen.findAllByRole('button', { name: /정답률 50%/ });
    fireEvent.click(itemBtn);
    fireEvent.click(await screen.findByRole('link', { name: '상세 보기' }));

    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history/detail'));

    fireEvent.click(screen.getByRole('button', { name: '이력으로 돌아가기' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history?page=2'));
  });

  it('레거시 /history/:id 로딩 상태를 보인다', async () => {
    const client = {
      get: vi.fn(() => ({ json: () => new Promise(() => {}) })),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;
    renderHistoryRoutes(client, '/history/set-1');
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});
