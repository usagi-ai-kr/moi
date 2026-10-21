import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { AppShell } from '../../src/ui/AppShell';
import { copy } from '../../src/ui/copy';
import type { ApiClient } from '../../src/ui/api/client';
import { ReviewScreen } from '../../src/ui/review/ReviewScreen';
import { formatDateTime } from '../../src/ui/study/types';
import { StartView } from '../../src/ui/study/StartView';

function loggedInClient(): ApiClient {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets')) return { items: [], total: 0 };
        if (String(path).startsWith('api/review/')) {
          if (String(path).includes('/candidates')) {
            const u = new URL(String(path), 'http://localhost/');
            const mode = u.searchParams.get('mode') ?? 'wrong';
            return { examId: 'saa-c03', mode, total: 0, items: [] };
          }
          if (String(path).includes('/sessions/current')) {
            throw Object.assign(new Error('not found'), { response: { status: 404 } });
          }
          return { examId: 'saa-c03', total: 0, items: [] };
        }
        return { user: { id } };
      },
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function emptyReviewClient(): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        const u = new URL(String(path), 'http://localhost/');
        if (u.pathname === '/api/review/candidates') {
          const mode = u.searchParams.get('mode') ?? 'wrong';
          return { examId: 'saa-c03', mode, total: 0, items: [] };
        }
        if (u.pathname === '/api/review/sessions/current') {
          const err = new Error('not_found') as Error & { response?: { status: number } };
          err.response = { status: 404 };
          const { HTTPError } = await import('ky');
          throw new HTTPError(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }), new Request('http://localhost/x'), {} as never);
        }
        if (u.pathname === '/api/review/bookmarks') {
          return { examId: 'saa-c03', total: 0, items: [] };
        }
        throw new Error(`unexpected GET ${path}`);
      },
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('#212 날짜 표시 (초/ms 정규화·손상값 fallback)', () => {
  it('초와 ms가 같은 날짜로 표시되고 1970이 아니다', () => {
    const sec = 1700000010;
    const ms = 1700000010000;
    const fromSec = formatDateTime(sec);
    const fromMs = formatDateTime(ms);
    expect(fromSec).toBe(fromMs);
    expect(fromSec).not.toMatch(/1970/);
    expect(fromMs).not.toMatch(/1970/);
    expect(fromSec).toContain('2023');
  });

  it('0/음수/NaN/Infinity/null/undefined는 날짜 정보 없음이다', () => {
    for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(formatDateTime(v as number)).toBe(copy.study.unknownDate);
    }
    expect(copy.study.unknownDate).toBe('날짜 정보 없음');
  });

  it('경계 1e12: 1e9초와 1e12ms는 같은 날짜다', () => {
    expect(formatDateTime(1_000_000_000)).toBe(formatDateTime(1_000_000_000_000));
    expect(formatDateTime(1_000_000_000_000)).toContain('2001');
  });

  it('Asia/Seoul 기준 한국어 형식이다', () => {
    // 1700000010000ms = UTC 2023-11-14 22:13:30 → KST 2023-11-15
    expect(formatDateTime(1700000010000)).toMatch(/2023\.\s*11\.\s*15/);
  });
});

describe('#212 학습 시작 selector/CTA', () => {
  it('시험 선택은 셸 1곳에만 있고 화면은 시험 기준 라벨로 알린다 (#239)', () => {
    const noop = vi.fn();
    const { container } = renderWithClient(
      <StartView
        scope="all"
        domainId="dom-security"
        pending={false}
        conflict={false}
        unauthorized={false}
        startError={null}
        onScope={noop}
        onDomain={noop}
        onStart={noop}
        onResume={noop}
        onHistory={noop}
      />,
    );
    // 가짜 비활성 selector는 제거했다 — 시험 선택은 셸(헤더/드로어)의 실제 select 1곳이다.
    expect(screen.queryByRole('combobox', { name: copy.exam.label })).not.toBeInTheDocument();
    expect(container.querySelector('.moi-exam-scope-name')?.textContent).toBe('AWS SAA-C03');
    expect(screen.getByText(copy.exam.note)).toBeInTheDocument();
    expect(screen.getByText(copy.study.examContext)).toBeInTheDocument();
    expect(screen.queryByText(/saa-c03/)).not.toBeInTheDocument();
  });

  it('CTA 위계: primary 학습 시작·secondary 학습 이력을 보인다', () => {
    const noop = vi.fn();
    const { container } = renderWithClient(
      <StartView
        scope="all"
        domainId="dom-security"
        pending={false}
        conflict={false}
        unauthorized={false}
        startError={null}
        onScope={noop}
        onDomain={noop}
        onStart={noop}
        onResume={noop}
        onHistory={noop}
      />,
    );
    expect(screen.getByRole('button', { name: copy.study.startAction })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.study.historyLink })).toBeInTheDocument();
    expect(container.querySelector('.moi-study-primary')).not.toBeNull();
    expect(container.querySelector('.moi-study-link')).not.toBeNull();
  });

  it('홈은 시험 정보·10문제 CTA·이력·이어풀기를 보인다', async () => {
    const client = loggedInClient();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    window.history.replaceState(null, '', '/');
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <App client={client} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('button', { name: copy.study.cta })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.study.historyLink })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.study.continueStudy })).toBeInTheDocument();
    // 현재 시험 라벨(배지)과 지원 안내를 보여준다(#239).
    expect(container.querySelector('.moi-exam-scope-name')?.textContent).toBe('AWS SAA-C03');
    expect(screen.getByText(copy.exam.note)).toBeInTheDocument();
  });
});

describe('#212 복습 빈 상태 다음 행동', () => {
  it('오답 빈 상태에서 새 학습 시작과 북마크 바로가기를 제공한다', async () => {
    renderWithClient(<ReviewScreen client={emptyReviewClient()} />);
    expect(await screen.findByText(copy.review.emptyWrong)).toBeInTheDocument();
    const studyLink = screen.getByRole('link', { name: copy.review.goToStudy });
    expect(studyLink).toHaveAttribute('href', '/study/new');
    expect(screen.getByRole('button', { name: copy.review.goToBookmarkReview })).toBeInTheDocument();
  });

  it('빈 상태에서 모드 전환 버튼으로 반대 탭으로 이동한다', async () => {
    renderWithClient(<ReviewScreen client={emptyReviewClient()} />);
    await screen.findByText(copy.review.emptyWrong);
    fireEvent.click(screen.getByRole('button', { name: copy.review.goToBookmarkReview }));
    expect(await screen.findByText(copy.review.emptyBookmark)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.review.goToWrongReview })).toBeInTheDocument();
  });
});

describe('#212 헤더 브랜드 아이콘', () => {
  it('브랜드 앞에 장식 아이콘(aria-hidden)을 두고 nav 간격·active를 유지한다', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell onLogout={async () => {}} pending={false} />}>
            <Route index element={<div>home</div>} />
            <Route path="history" element={<div>history</div>} />
            <Route path="review" element={<div>review</div>} />
            <Route path="account" element={<div>account</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const icon = container.querySelector('img.moi-brand-icon') as HTMLImageElement | null;
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('src')).toBe('/favicon.svg');
    expect(icon?.getAttribute('alt')).toBe('');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(Number(icon?.getAttribute('width'))).toBeGreaterThanOrEqual(20);
    expect(Number(icon?.getAttribute('width'))).toBeLessThanOrEqual(24);
    expect(screen.getByText(copy.brand)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.nav.study })).toHaveAttribute('aria-current', 'page');
  });
});

describe('#212 문서 title', () => {
  it('index.html title이 정확한 문구다', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('<title>moi - 티끌 moi면 합격</title>');
    expect(html).not.toContain('moi — AWS SAA 학습');
  });

  it('라우트 전환 후에도 title이 유지된다(정적 title)', async () => {
    document.title = 'moi - 티끌 moi면 합격';
    const client = loggedInClient();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/', '/history', '/review']}>
          <App client={client} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: copy.study.cta }).catch(() => null);
    expect(document.title).toBe('moi - 티끌 moi면 합격');
  });
});
