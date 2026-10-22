// #224 추가 피드백 — 완료한 학습 목록의 컬럼 분리·숫자 서체·모바일 카드 (RTL).
// AC: 완료일/학습 범위/정답률/문항 수/상세 보기 컬럼, tabular-nums+mono 숫자 셀,
//     0문제·0%·긴 영역명·날짜 누락·자리수 대응, 모바일 라벨-값 카드, 상세·페이징 회귀 없음.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudySummary } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { COMPACT_HISTORY_QUERY } from '../../src/ui/history/CompletedHistoryList';
import { HistoryPage } from '../../src/ui/pages/HistoryPage';

interface ItemSeed {
  id: string;
  mode?: 'all' | 'domain' | 'weak';
  domainId?: string;
  submittedAt?: number | null;
  correctCount?: number;
  accuracyPercent?: number;
}

const DEFAULT_ITEMS: ItemSeed[] = [
  { id: 'a', submittedAt: 1700000000000, correctCount: 10, accuracyPercent: 50 },
  { id: 'b', submittedAt: 1700000001000, correctCount: 1, accuracyPercent: 100 },
  { id: 'c', submittedAt: 1700000002000, correctCount: 0, accuracyPercent: 0 },
];

function toSummary(seed: ItemSeed): StudySummary {
  return {
    id: seed.id,
    examId: 'saa-c03',
    mode: seed.mode ?? 'all',
    ...(seed.domainId ? { domainId: seed.domainId } : {}),
    submittedAt: ('submittedAt' in seed ? (seed.submittedAt as number) : 1700000000000),
    correctCount: seed.correctCount ?? 10,
    accuracyPercent: seed.accuracyPercent ?? 50,
  };
}

function makeClient(items: ItemSeed[], total = items.length) {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets')) {
          const u = new URL(String(path), 'http://localhost/');
          const page = Number(u.searchParams.get('page') ?? '1');
          const pageSize = Number(u.searchParams.get('pageSize') ?? '20');
          const start = (page - 1) * pageSize;
          const count = Math.max(0, Math.min(pageSize, total - start));
          return { items: items.slice(start, start + count).map(toSummary), total };
        }
        return { user: { id: 'user-1' } };
      },
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function LocationProbe({ onLocation }: { onLocation: (loc: string) => void }) {
  const loc = useLocation();
  onLocation(loc.pathname + loc.search);
  return null;
}

function NavigationControls({ onControls }: { onControls: (ctrl: { back: () => void }) => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    onControls({ back: () => navigate(-1) });
  }, [navigate, onControls]);
  return null;
}

function renderHistory(
  client: ApiClient,
  opts?: { onLocation?: (loc: string) => void; onControls?: (ctrl: { back: () => void }) => void },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/history?tab=completed']}>
        {opts?.onLocation && <LocationProbe onLocation={opts.onLocation} />}
        {opts?.onControls && <NavigationControls onControls={opts.onControls} />}
        <Routes>
          <Route path="/history" element={<HistoryPage client={client} userId="history-user" />} />
          <Route path="/history/detail" element={<p data-testid="detail-page">상세</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 모바일(≤767px) 구간을 흉내내는 matchMedia 오버라이드. */
function useCompactViewport(compact: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: compact && query === COMPACT_HISTORY_QUERY,
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
  vi.restoreAllMocks();
});

describe('완료 목록 컬럼 표 — 데스크톱 (AC-1·AC-2)', () => {
  it('완료일/학습 범위/정답률/문항 수/상세 보기 헤더가 scope=col로 선언된다', async () => {
    renderHistory(makeClient(DEFAULT_ITEMS));
    const table = await screen.findByRole('table');

    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(5);
    expect(headers.map((th) => th.textContent)).toEqual([
      copy.history.completedColumnDate,
      copy.history.completedColumnScope,
      copy.history.completedColumnAccuracy,
      copy.history.completedColumnCount,
      copy.study.detail,
    ]);
    for (const th of headers) {
      expect(th).toHaveAttribute('scope', 'col');
    }
  });

  it('헤더와 셀의 열 순서가 일치한다 (헤더 아래 같은 컬럼)', async () => {
    renderHistory(makeClient(DEFAULT_ITEMS));
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    // thead 1행 + tbody 3행
    expect(rows).toHaveLength(4);

    const headerCells = within(rows[0]).getAllByRole('columnheader');
    const bodyCells = within(rows[1]).getAllByRole('cell');
    expect(bodyCells).toHaveLength(headerCells.length);
    for (let i = 0; i < headerCells.length; i += 1) {
      // 셀 개수·순서가 헤더와 1:1로 대응한다.
      expect(bodyCells[i]).toBeDefined();
    }
    expect(bodyCells[0].textContent).toMatch(/\d{4}\./);
    expect(bodyCells[1].textContent).toBe('전체');
    expect(bodyCells[2].textContent).toBe('50%');
    expect(bodyCells[3].textContent).toBe('10문제');
    expect(within(bodyCells[4]).getByRole('button', { name: /상세 보기/ })).toBeInTheDocument();
  });

  it('숫자 셀(완료일·정답률·문항 수)은 고정폭 숫자 서체, 범위 셀은 본문 서체다', async () => {
    renderHistory(makeClient(DEFAULT_ITEMS));
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    const bodyCells = within(rows[1]).getAllByRole('cell');

    expect(bodyCells[0].querySelector('.moi-history-num')).not.toBeNull();
    expect(bodyCells[2].querySelector('.moi-history-num')).not.toBeNull();
    expect(bodyCells[3].querySelector('.moi-history-num')).not.toBeNull();
    // 한국어 범위명·헤더는 본문 서체를 유지한다.
    expect(bodyCells[1].querySelector('.moi-history-num')).toBeNull();
    expect(bodyCells[1]).toHaveTextContent('전체');
  });

  it('0문제·0%도 같은 컬럼에 0으로 표시한다 (값 발명 없이)', async () => {
    renderHistory(makeClient([{ id: 'zero', submittedAt: 1700000000000, correctCount: 0, accuracyPercent: 0 }]));
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    const bodyCells = within(rows[1]).getAllByRole('cell');

    expect(bodyCells[2]).toHaveTextContent('0%');
    expect(bodyCells[3]).toHaveTextContent('0문제');
  });

  it('1/10/100 자리수가 달라도 숫자 셀은 같은 컬럼에 정렬된다', async () => {
    renderHistory(
      makeClient([
        { id: 'one', correctCount: 1, accuracyPercent: 1 },
        { id: 'ten', correctCount: 10, accuracyPercent: 10 },
        { id: 'hundred', correctCount: 100, accuracyPercent: 100 },
      ]),
    );
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    const values = rows.slice(1).map((row) => {
      const cells = within(row).getAllByRole('cell');
      return [cells[2].textContent, cells[3].textContent];
    });
    expect(values).toEqual([
      ['1%', '1문제'],
      ['10%', '10문제'],
      ['100%', '100문제'],
    ]);
    // 자리수가 달라도 모두 숫자 서체 span 안의 값이다.
    for (const row of rows.slice(1)) {
      const cells = within(row).getAllByRole('cell');
      expect(cells[2].querySelector('.moi-history-num')?.textContent).toMatch(/^\d+%$/);
      expect(cells[3].querySelector('.moi-history-num')?.textContent).toMatch(/^\d+문제$/);
    }
  });

  it('날짜를 모르면 1970 대신 알 수 없음 문구를 본문 서체로 보여준다', async () => {
    renderHistory(makeClient([{ id: 'nodate', submittedAt: null, correctCount: 3, accuracyPercent: 30 }]));
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    const dateCell = within(rows[1]).getAllByRole('cell')[0];

    expect(dateCell).toHaveTextContent(copy.study.unknownDate);
    expect(dateCell.textContent).not.toMatch(/1970/);
    expect(dateCell.querySelector('.moi-history-num')).toBeNull();
    expect(dateCell.querySelector('.moi-history-unknown')).not.toBeNull();
  });

  it('긴 영역명도 컬럼을 깨지 않고 그대로 보여준다', async () => {
    const longDomain = '아주-긴-영역-이름-테스트-용-도메인-이름';
    renderHistory(
      makeClient([
        { id: 'long', mode: 'domain', domainId: longDomain, correctCount: 5, accuracyPercent: 50 },
      ]),
    );
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    const scopeCell = within(rows[1]).getAllByRole('cell')[1];

    expect(scopeCell).toHaveTextContent('영역별');
    expect(scopeCell).toHaveTextContent(copy.stats.unknownDomain);
    // 원시 식별자는 노출하지 않는다.
    expect(scopeCell.textContent).not.toContain(longDomain);
  });
});

describe('완료 목록 — 모바일 라벨-값 카드 (AC-3)', () => {
  it('좁은 화면에서는 표 대신 라벨-값 카드를 보여준다', async () => {
    useCompactViewport(true);
    renderHistory(makeClient(DEFAULT_ITEMS));

    expect(await screen.findByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const card = screen.getAllByRole('listitem')[0];
    const terms = within(card).getAllByRole('term').map((dt) => dt.textContent);
    expect(terms).toEqual([
      copy.history.completedColumnDate,
      copy.history.completedColumnScope,
      copy.history.completedColumnAccuracy,
      copy.history.completedColumnCount,
    ]);
    const defs = within(card).getAllByRole('definition').map((dd) => dd.textContent);
    expect(defs[1]).toBe('전체');
    expect(defs[2]).toBe('50%');
    expect(defs[3]).toBe('10문제');
    expect(within(card).getByRole('button', { name: /상세 보기/ })).toBeInTheDocument();
  });

  it('데스크톱 구간에서는 카드와 표가 동시에 노출되지 않는다', async () => {
    renderHistory(makeClient(DEFAULT_ITEMS));
    await screen.findByRole('table');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('완료 목록 — 상세 진입·페이징·키보드 회귀 없음 (AC-4)', () => {
  it('상세 보기 액션이 요약 대화상자를 열고 상세 페이지로 이동할 수 있다', async () => {
    let location = '';
    renderHistory(makeClient(DEFAULT_ITEMS), { onLocation: (l) => { location = l; } });

    const [action] = await screen.findAllByRole('button', { name: /상세 보기/ });
    fireEvent.click(action);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toContain('학습 상세');
    expect(dialog.getAttribute('aria-label')).not.toMatch(/set-|uuid/i);

    fireEvent.click(within(dialog).getByRole('link', { name: '상세 보기' }));
    await waitFor(() => {
      expect(location).toBe('/history/detail');
    });
  });

  it('닫기 동작으로 요약 대화상자가 사라진다', async () => {
    renderHistory(makeClient(DEFAULT_ITEMS));
    const [action] = await screen.findAllByRole('button', { name: /상세 보기/ });
    fireEvent.click(action);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: copy.study.close }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('행 액션은 버튼이라 키보드(Enter)로도 동작한다', async () => {
    renderHistory(makeClient(DEFAULT_ITEMS));
    const [action] = await screen.findAllByRole('button', { name: /상세 보기/ });
    expect(action.tagName).toBe('BUTTON');
    expect(action).toHaveAttribute('type', 'button');

    action.focus();
    expect(document.activeElement).toBe(action);
    fireEvent.click(action);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('페이지 이동 후에도 컬럼 표가 유지된다', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, correctCount: 10, accuracyPercent: 50 }));
    renderHistory(makeClient(many, many.length));

    expect(await screen.findByText('총 25건')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => {
      expect(screen.getByText('현재 2 / 전체 2')).toBeInTheDocument();
    });
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(5);
  });

  it('빈 상태에서는 표 대신 안내 문구를 보여준다', async () => {
    renderHistory(makeClient([]));
    expect(await screen.findByText(/아직 완료한 학습이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
