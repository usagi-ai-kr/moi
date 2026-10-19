import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import type { ApiClient, StudyActiveSet } from '../../src/ui/api/client';
import { HistoryDetailPage } from '../../src/ui/pages/HistoryDetailPage';
import { StudyRoute } from '../../src/ui/pages/StudyRoute';
import { useStudyUiStore } from '../../src/ui/study/store';

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

function fakeStudyClient(o: { start?: StudyActiveSet; get?: StudyActiveSet } = {}): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets/')) {
          if (o.get) return o.get;
          throw httpError(404, { error: 'not_found' });
        }
        throw httpError(404, { error: 'not_found' });
      },
    })),
    post: vi.fn((path: string) => ({
      json: async () => {
        if (String(path) === 'api/study/sets') return o.start ?? makeSet();
        if (String(path).endsWith('/submit')) return submittedSet();
        if (String(path).endsWith('/abandon')) return makeSet({ status: 'abandoned' });
        throw httpError(404, { error: 'not_found' });
      },
    })),
    patch: vi.fn(() => ({ json: async () => ({ outcome: 'answered' }) })),
  } as unknown as ApiClient;
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
  return <p data-testid="location">{loc.pathname + loc.search}</p>;
}

function renderStudyRoutes(client: ApiClient, initial: string) {
  resetStore();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/study/new" element={<StudyRoute client={client} userId="user-1" mode="start" />} />
          <Route path="/study/:setId" element={<StudyRoute client={client} userId="user-1" mode="active" />} />
          <Route
            path="/study/:setId/result"
            element={<StudyRoute client={client} userId="user-1" mode="result" />}
          />
        </Routes>
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderHistoryDetail(client: ApiClient, initial: string) {
  resetStore();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/history/:setId" element={<HistoryDetailPage client={client} />} />
          <Route path="/history" element={<p>history-list</p>} />
        </Routes>
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('학습 라우트 분리 (#148)', () => {
  it('/study/new 렌더 + 시작 성공 시 /study/:id로 이동한다', async () => {
    renderStudyRoutes(fakeStudyClient({ start: makeSet() }), '/study/new');
    expect(await screen.findByText('학습 범위 선택')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    expect(await screen.findByText(/1\/20/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/study/set-1'));
  });

  it('/study/:id 직접 진입 + submitted면 /result로 replace한다', async () => {
    renderStudyRoutes(fakeStudyClient({ get: submittedSet() }), '/study/set-1');
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/study/set-1/result'));
  });

  it('/study/:id/result 직접 진입 시 결과를 보인다', async () => {
    renderStudyRoutes(fakeStudyClient({ get: submittedSet() }), '/study/set-1/result');
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/study/set-1/result');
  });

  it('/history/:id 로딩 상태를 보인다', async () => {
    const client = {
      get: vi.fn(() => ({ json: () => new Promise(() => {}) })),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;
    renderHistoryDetail(client, '/history/set-1');
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('/history/:id 오류 시 재시도와 돌아가기를 보인다', async () => {
    const client = {
      get: vi.fn(() => ({
        json: async () => {
          throw httpError(500, { error: 'internal' });
        },
      })),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;
    renderHistoryDetail(client, '/history/set-1');
    expect(await screen.findByText(/상태를 불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이력으로 돌아가기' })).toBeInTheDocument();
  });

  it('/history/:id 정상 시 결과와 돌아가기를 보인다', async () => {
    const client = fakeStudyClient({ get: submittedSet() });
    renderHistoryDetail(client, '/history/set-1');
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이력으로 돌아가기' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history'));
  });

  it('legacy /?study=id는 /study/:id로 redirect한다', async () => {
    const meId = 'user-1';
    const client = {
      get: vi.fn((path: string) => ({
        json: async () => {
          if (String(path).startsWith('api/study/sets/')) return makeSet();
          if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
          if (String(path).startsWith('api/me')) return { user: { id: meId } };
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
  });
});
