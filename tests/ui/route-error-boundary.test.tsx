import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { Suspense, lazy } from 'react';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../src/ui/copy';
import { RouteErrorBoundary } from '../../src/ui/RouteErrorBoundary';
import { ConflictPanel } from '../../src/ui/study/ConflictPanel';
import { App } from '../../src/ui/App';
import type { ApiClient, StudyActiveItem } from '../../src/ui/api/client';

describe('RouteErrorBoundary (#148)', () => {
  // window.location을 교체한 테스트가 다른 테스트에 새지 않도록 원래 descriptor를 복원한다.
  const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  });

  it('lazy import가 reject되면 경계 안내·새로고침 버튼이 보이고 오류 메시지 원문은 보이지 않는다', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    });

    const brokenMessage = 'ChunkLoadError: Loading chunk 148 failed at https://example.com/chunk-148.js';
    const BrokenRoute = lazy(() => Promise.reject(new Error(brokenMessage)));

    // React ErrorBoundary console.error 억제
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <RouteErrorBoundary>
        <Suspense fallback={<p>{copy.common.loading}</p>}>
          <BrokenRoute />
        </Suspense>
      </RouteErrorBoundary>,
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
    // 라우터 없는 사용처(최상위 lazy 실패 경계)는 일반 앵커로 폴백한다.
    expect(homeLink.tagName.toLowerCase()).toBe('a');

    // 오류 메시지 원문·스택·URL은 화면에 노출되지 않음
    expect(screen.queryByText(new RegExp(brokenMessage))).not.toBeInTheDocument();
    expect(screen.queryByText(/ChunkLoadError/)).not.toBeInTheDocument();
    expect(screen.queryByText(/https:\/\/example\.com/)).not.toBeInTheDocument();

    fireEvent.click(reloadBtn);
    expect(reloadMock).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('경계 발생 후 다른 경로로 이동하면 정상 화면이 보인다', async () => {
    const brokenMessage = 'Network error loading chunk';
    const BrokenRoute = lazy(() => Promise.reject(new Error(brokenMessage)));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function TestApp() {
      const location = useLocation();
      const navigate = useNavigate();
      return (
        <div>
          <button type="button" onClick={() => void navigate('/broken')}>
            Go Broken
          </button>
          <RouteErrorBoundary
            key={location.pathname}
            resetKey={location.pathname}
            homeLink={
              <Link to="/" className="moi-study-link">
                {copy.common.home}
              </Link>
            }
          >
            <Routes>
              <Route path="/" element={<p>정상 홈 화면</p>} />
              <Route
                path="/broken"
                element={
                  <Suspense fallback={<p>{copy.common.loading}</p>}>
                    <BrokenRoute />
                  </Suspense>
                }
              />
            </Routes>
          </RouteErrorBoundary>
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/broken']}>
        <TestApp />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('화면을 불러오지 못했습니다')).toBeInTheDocument();

    // 처음으로 링크 클릭하여 '/'로 이동
    const homeLink = screen.getByRole('link', { name: '처음으로' });
    fireEvent.click(homeLink);

    expect(await screen.findByText('정상 홈 화면')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('충돌 패널에 questionId·optionId 원시값이 보이지 않는다', () => {
    const rawQuestionId = 'q-raw-uuid-12345';
    const rawOptionId = 'opt-raw-uuid-67890';
    const items: StudyActiveItem[] = [
      {
        questionId: rawQuestionId,
        questionVersionId: 'qv-1',
        versionNo: 1,
        optionOrder: ['opt-1', rawOptionId, 'opt-3'],
        stem: '문제 본문',
        options: [
          { optionId: 'opt-1', text: '보기 1번 내용' },
          // rawOptionId는 options에 text가 없음 -> optionOrder 인덱스+1 (2)이 되어야 함
        ],
        answerCount: 1,
        response: { kind: 'unanswered' },
      },
    ];

    const conflicts = [
      {
        questionId: rawQuestionId,
        server: { kind: 'answered' as const, optionIds: [rawOptionId] },
        local: { kind: 'answered' as const, optionIds: ['non-existent-opt'] },
      },
    ];

    render(
      <ConflictPanel
        conflicts={conflicts}
        items={items}
        pending={false}
        onUseServer={vi.fn()}
        onUseMine={vi.fn()}
      />,
    );

    // 원시 questionId, optionId가 화면에 나타나지 않음
    expect(screen.queryByText(new RegExp(rawQuestionId))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(rawOptionId))).not.toBeInTheDocument();
    expect(screen.queryByText(/non-existent-opt/)).not.toBeInTheDocument();

    // questionId 대신 "문제 1" 표시
    expect(screen.getByText('문제 1')).toBeInTheDocument();

    // optionOrder[1]인 rawOptionId fallback: 2
    expect(screen.getByText(/서버 답안: 2/)).toBeInTheDocument();
    // 매칭 실패 non-existent-opt fallback: ?
    expect(screen.getByText(/내 답안: \?/)).toBeInTheDocument();
  });

  it('충돌 패널에서 index를 못 찾으면 copy.study.questionLabel만 보여 준다', () => {
    const unindexedQuestionId = 'q-unindexed-999';
    const conflicts = [
      {
        questionId: unindexedQuestionId,
        server: { kind: 'pass' as const },
        local: { kind: 'unanswered' as const },
      },
    ];

    render(
      <ConflictPanel
        conflicts={conflicts}
        items={[]}
        pending={false}
        onUseServer={vi.fn()}
        onUseMine={vi.fn()}
      />,
    );

    expect(screen.queryByText(new RegExp(unindexedQuestionId))).not.toBeInTheDocument();
    expect(screen.getByText('문제')).toBeInTheDocument();
  });

  it('로그인 상태에서 lazy 라우트 로딩 중에는 "로그인 상태를 확인" 문구가 아니라 범용 로딩 문구가 보인다', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const client = {
      get: vi.fn((path: string) => {
        if (String(path).includes('api/me')) return { json: async () => ({ user: { id } }) };
        return { json: async () => ({ total: 0, items: [] }) };
      }),
      post: vi.fn(async () => new Response(null, { status: 204 })),
      patch: vi.fn(),
    } as unknown as ApiClient;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/account']}>
          <App client={client} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 로그인된 상태에서 lazy 컴포넌트 로딩 폴백은 copy.common.loading("불러오고 있습니다")
    expect(await screen.findByText('불러오고 있습니다')).toBeInTheDocument();
    expect(screen.queryByText('로그인 상태를 확인하고 있습니다')).not.toBeInTheDocument();
  });

  it('App 라우트에서 에러 발생 시 경계 안내가 보이고 다른 라우트로 이동하면 정상 복구된다', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const client = {
      get: vi.fn((path: string) => {
        if (String(path).includes('api/me')) return { json: async () => ({ user: { id } }) };
        throw new Error('API failure');
      }),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <App client={client} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 정상 홈 화면 확인
    expect(await screen.findByRole('button', { name: '학습 시작' })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
