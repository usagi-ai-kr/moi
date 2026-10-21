// #239 시험 context·selector — URL 계약·화면 라벨·접근성 (ADR-0068).
// Given/When/Then 시나리오는 이슈 #239 BDD 수용 기준(AC 1~4)에 대응한다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { copy } from '../../src/ui/copy';
import { DEFAULT_EXAM_CODE, EXAM_CATALOG } from '../../src/ui/exam/exam-catalog';
import { ExamScope } from '../../src/ui/exam/ExamScope';
import { ExamSelector } from '../../src/ui/exam/ExamSelector';
import { ExamScopeContext, ExamScopeProvider, useExamScope } from '../../src/ui/exam/ExamScopeProvider';
import { MOBILE_NAV_QUERY } from '../../src/ui/responsive';
import { useUiStore, type ApiClient } from '../../src/ui/session';

function loggedInClient(): ApiClient {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
        if (String(path).startsWith('api/study/stats')) {
          return {
            examId: 'saa-c03',
            totalQuestions: 500,
            uniqueFirstSolved: 0,
            coverage: 0,
            overallAccuracy: 0,
            domains: [],
            weakDomains: [],
          };
        }
        if (String(path).startsWith('api/review/')) {
          if (String(path).includes('/sessions/current')) {
            throw Object.assign(new Error('not found'), { response: { status: 404 } });
          }
          return { examId: 'saa-c03', mode: 'wrong', total: 0, items: [] };
        }
        return { user: { id } };
      },
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

/** 현재 주소(pathname+search)를 보여주는 probe — URL 계약을 관찰한다. */
function LocationView() {
  const location = useLocation();
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>;
}

/** 뒤로가기 — push/replace를 구분한다. */
function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      뒤로
    </button>
  );
}

/** context 값을 그대로 노출하는 probe. */
function ScopeProbe() {
  const scope = useExamScope();
  return (
    <div data-testid="scope">
      {`${scope.code}|${scope.examId}|${scope.label}|${scope.exams.length}`}
    </div>
  );
}

function renderAt(ui: React.ReactElement, initialEntries: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        {ui}
        <LocationView />
        <BackButton />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderAppAt(url: string) {
  window.history.replaceState(null, '', url);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <App client={loggedInClient()} />
        <LocationView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 모바일(≤767px) 구간을 흉내내는 matchMedia 오버라이드. */
function useMobileViewport(): void {
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

beforeEach(() => {
  useUiStore.setState({ authBannerDismissed: false, logoutPending: false });
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('#239 시험 context — URL 계약 (AC 3)', () => {
  it('Provider 밖에서도 기본 시험(saa-c03)으로 읽는다', () => {
    renderAt(<ScopeProbe />, ['/']);
    expect(screen.getByTestId('scope').textContent).toBe('saa-c03|saa-c03|AWS SAA-C03|1');
  });

  it('?exam=saa-c03 은 그대로 유지하고 내부 ID는 노출하지 않는다', async () => {
    renderAt(
      <ExamScopeProvider>
        <ScopeProbe />
      </ExamScopeProvider>,
      ['/history?exam=saa-c03&tab=completed'],
    );
    expect(screen.getByTestId('scope').textContent).toBe('saa-c03|saa-c03|AWS SAA-C03|1');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/history?exam=saa-c03&tab=completed'));
  });

  it('?exam=unknown 은 기본값으로 replace하고 다른 query를 보존한다', async () => {
    renderAt(
      <ExamScopeProvider>
        <ScopeProbe />
      </ExamScopeProvider>,
      ['/history?tab=completed&exam=unknown'],
    );
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe('/history?tab=completed&exam=saa-c03'),
    );
    expect(screen.getByTestId('scope').textContent).toBe('saa-c03|saa-c03|AWS SAA-C03|1');
  });

  it('내부 ID(exam-saa-c03)는 허용목록 밖이라 replace되고 화면에 남지 않는다', async () => {
    renderAt(
      <ExamScopeProvider>
        <ScopeProbe />
        <ExamScope />
      </ExamScopeProvider>,
      ['/?exam=exam-saa-c03'],
    );
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/?exam=saa-c03'));
    expect(document.body.textContent).not.toContain('exam-saa-c03');
  });

  it('?exam 이 없으면 기본값으로 동작하고 URL을 오염시키지 않는다', async () => {
    renderAt(
      <ExamScopeProvider>
        <ScopeProbe />
      </ExamScopeProvider>,
      ['/history?tab=completed'],
    );
    expect(screen.getByTestId('scope').textContent).toBe('saa-c03|saa-c03|AWS SAA-C03|1');
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId('loc').textContent).toBe('/history?tab=completed');
  });
});

describe('#239 시험 변경 — pathname·query 보존·page 초기화·push (AC 2)', () => {
  function SetExamButton() {
    const { setExam } = useExamScope();
    return (
      <button type="button" onClick={() => setExam('saa-c03')}>
        시험 전환
      </button>
    );
  }

  it('시험을 바꾸면 pathname·tab을 유지하고 page만 1로 초기화한다', async () => {
    renderAt(
      <ExamScopeProvider>
        <SetExamButton />
      </ExamScopeProvider>,
      ['/history?tab=completed&page=2'],
    );
    fireEvent.click(screen.getByRole('button', { name: '시험 전환' }));
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe('/history?tab=completed&page=1&exam=saa-c03'),
    );
  });

  it('시험 변경은 push — 뒤로가기로 직전 주소로 돌아간다', async () => {
    renderAt(
      <ExamScopeProvider>
        <SetExamButton />
      </ExamScopeProvider>,
      ['/history?tab=completed'],
    );
    fireEvent.click(screen.getByRole('button', { name: '시험 전환' }));
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe('/history?tab=completed&exam=saa-c03'),
    );
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/history?tab=completed'));
  });

  it('허용목록 밖 값은 시험으로 받아들이지 않는다', async () => {
    function BadExamButton() {
      const { setExam } = useExamScope();
      return (
        <button type="button" onClick={() => setExam('exam-saa-c03')}>
          잘못된 시험
        </button>
      );
    }
    renderAt(
      <ExamScopeProvider>
        <BadExamButton />
      </ExamScopeProvider>,
      ['/history?tab=completed'],
    );
    fireEvent.click(screen.getByRole('button', { name: '잘못된 시험' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId('loc').textContent).toBe('/history?tab=completed');
  });
});

describe('#239 시험 selector — 실제 select·접근 이름·선택 연동 (AC 2)', () => {
  it('셸 selector는 비활성이 아니고 옵션이 1개이며 접근 이름이 "시험"이다', () => {
    renderAt(
      <ExamScopeProvider>
        <ExamSelector id="exam-test" />
      </ExamScopeProvider>,
      ['/'],
    );
    const select = screen.getByRole('combobox', { name: '시험' }) as unknown as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(select.value).toBe(DEFAULT_EXAM_CODE);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'AWS SAA-C03' })).toBeInTheDocument();
    expect(screen.getByLabelText('시험')).toBe(select);
  });

  it('옵션을 고르면 setExam이 호출된다 (시험 추가 시 그대로 동작)', () => {
    const setExam = vi.fn();
    const twoExams = [
      { code: 'saa-c03', label: 'AWS SAA-C03', fullLabel: 'AWS SAA-C03 정식' },
      { code: 'dva-c02', label: 'AWS DVA-C02', fullLabel: 'AWS DVA-C02 정식' },
    ];
    render(
      <ExamScopeContext.Provider
        value={{ code: 'saa-c03', examId: 'saa-c03', label: 'AWS SAA-C03', exams: twoExams, setExam }}
      >
        <ExamSelector id="exam-test" />
      </ExamScopeContext.Provider>,
    );
    const select = screen.getByRole('combobox', { name: '시험' }) as unknown as HTMLSelectElement;
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.change(select, { target: { value: 'dva-c02' } });
    expect(setExam).toHaveBeenCalledWith('dva-c02');
  });

  it('시험 라벨 배지는 선택 시험의 표시명을 보여준다', () => {
    const { container } = renderAt(
      <ExamScopeProvider>
        <ExamScope />
      </ExamScopeProvider>,
      ['/'],
    );
    expect(screen.getByText('시험 기준')).toBeInTheDocument();
    expect(container.querySelector('.moi-exam-scope-name')?.textContent).toBe('AWS SAA-C03');
    expect(container.querySelector('.moi-exam-scope')).toHaveAttribute('data-exam-code', 'saa-c03');
  });

  it('code를 넘기면 그 시험(세트 소유 시험)의 표시명을 보여준다', () => {
    renderAt(
      <ExamScopeProvider>
        <ExamScope code="saa-c03" />
      </ExamScopeProvider>,
      ['/'],
    );
    expect(screen.getByText('AWS SAA-C03')).toBeInTheDocument();
  });

  it('미등록 코드는 라벨을 표시하지 않는다(내부 식별자 노출 방지)', () => {
    renderAt(
      <ExamScopeProvider>
        <ExamScope code="exam-saa-c03" />
      </ExamScopeProvider>,
      ['/'],
    );
    expect(screen.queryByText('시험 기준')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('exam-saa-c03');
  });
});

describe('#239 셸 — selector 1개·중복 없음 (AC 1·2)', () => {
  it('데스크톱은 헤더 selector 1개만 노출한다', async () => {
    renderAppAt('/');
    expect(await screen.findByRole('combobox', { name: '시험' })).toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: '시험' })).toHaveLength(1);
  });

  it('모바일은 헤더 selector를 내리고 Drawer를 열면 1개만 노출한다', async () => {
    useMobileViewport();
    renderAppAt('/');
    expect(await screen.findByRole('button', { name: '메뉴 열기' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '시험' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '시험' })).toBeInTheDocument());
    expect(screen.getAllByRole('combobox', { name: '시험' })).toHaveLength(1);
  });

  it('홈 화면은 현재 시험 라벨을 보여준다 (AC 1)', async () => {
    const { container } = renderAppAt('/');
    await screen.findByRole('button', { name: copy.study.cta });
    expect(container.querySelector('.moi-exam-scope-name')?.textContent).toBe('AWS SAA-C03');
    expect(screen.getByText(copy.exam.note)).toBeInTheDocument();
  });

  it('카탈로그는 공개 코드만 담는다 — 내부 ID는 없다', () => {
    for (const entry of EXAM_CATALOG) {
      expect(entry.code).not.toContain('exam-');
      expect(entry.code).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });
});
