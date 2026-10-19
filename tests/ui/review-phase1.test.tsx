import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import {
  getReviewCandidates,
  getCurrentReviewSession,
  startReviewSession,
  listBookmarks,
  setBookmark,
} from '../../src/ui/api/review-client';
import { ReviewScreen } from '../../src/ui/review/ReviewScreen';

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
    new Request('http://localhost/api/test'),
    {} as never,
  );
}

interface FakeReviewClientOptions {
  wrongCandidates?: Array<{ questionId: string; validWrongCount: number; stem: string }>;
  bookmarkCandidates?: Array<{ questionId: string; stem: string }>;
  activeSession?: {
    examId: string;
    mode: 'wrong' | 'bookmark';
    status: 'active';
    cursor: number;
    total: number;
    current: { questionId: string; stem: string; options: Array<{ optionId: string; text: string }>; response: null } | null;
  } | null;
  failCandidates?: boolean;
}

function createFakeReviewClient(opts: FakeReviewClientOptions = {}): ApiClient {
  const wrongItems = opts.wrongCandidates ?? [
    {
      questionId: 'q-w1',
      validWrongCount: 2,
      stem: 'Amazon S3 수명 주기 정책으로 비용을 절감하는 방안은 무엇인가?',
    },
    {
      questionId: 'q-w2',
      validWrongCount: 1,
      stem: 'VPC 간 안전한 전송을 구성하기 위해 필요한 리소스는?',
    },
  ];
  const bookmarkItems = opts.bookmarkCandidates ?? [];

  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        const u = new URL(String(path), 'http://localhost/');
        if (opts.failCandidates && u.pathname === '/api/review/candidates') {
          throw new TypeError('Failed to fetch');
        }
        if (u.pathname === '/api/review/candidates') {
          const mode = u.searchParams.get('mode');
          const examId = u.searchParams.get('examId') ?? 'saa-c03';
          if (mode === 'wrong') {
            return {
              examId,
              mode: 'wrong',
              total: wrongItems.length,
              items: wrongItems.map((item) => ({
                questionId: item.questionId,
                validWrongCount: item.validWrongCount,
                stem: item.stem,
                options: [
                  { optionId: 'opt-a', text: '보기 A 설명' },
                  { optionId: 'opt-b', text: '보기 B 설명' },
                ],
              })),
            };
          }
          if (mode === 'bookmark') {
            return {
              examId,
              mode: 'bookmark',
              total: bookmarkItems.length,
              items: bookmarkItems.map((item) => ({
                questionId: item.questionId,
                validWrongCount: 0,
                stem: item.stem,
                options: [
                  { optionId: 'opt-1', text: '북마크 보기 1' },
                  { optionId: 'opt-2', text: '북마크 보기 2' },
                ],
              })),
            };
          }
        }
        if (u.pathname === '/api/review/sessions/current') {
          if (opts.activeSession) {
            return {
              ...opts.activeSession,
              exhausted: opts.activeSession.current === null,
              items: [],
            };
          }
          throw httpError(404, { error: 'not_found' });
        }
        if (u.pathname === '/api/review/bookmarks') {
          return {
            examId: 'saa-c03',
            total: bookmarkItems.length,
            items: bookmarkItems.map((b) => ({
              questionId: b.questionId,
              stem: b.stem,
              options: [],
            })),
          };
        }
        throw httpError(404, { error: 'not_found' });
      },
    })),
    post: vi.fn((path: string, init?: { json?: unknown }) => ({
      json: async () => {
        const u = new URL(String(path), 'http://localhost/');
        if (u.pathname === '/api/review/sessions') {
          const body = (init?.json ?? {}) as { examId: string; mode: 'wrong' | 'bookmark' };
          return {
            examId: body.examId,
            mode: body.mode,
            status: 'active',
            cursor: 0,
            total: wrongItems.length,
            current: {
              questionId: 'q-w1',
              stem: wrongItems[0]?.stem ?? '첫 번째 복습 문제',
              options: [
                { optionId: 'opt-a', text: '보기 A 설명' },
                { optionId: 'opt-b', text: '보기 B 설명' },
              ],
              response: null,
            },
            items: [],
          };
        }
        throw httpError(404, { error: 'not_found' });
      },
    })),
    patch: vi.fn((path: string, init?: { json?: unknown }) => ({
      json: async () => {
        const u = new URL(String(path), 'http://localhost/');
        if (u.pathname === '/api/review/bookmarks') {
          const body = (init?.json ?? {}) as { examId: string; questionId: string; bookmarked: boolean };
          return {
            questionId: body.questionId,
            bookmarked: body.bookmarked,
          };
        }
        throw httpError(404, { error: 'not_found' });
      },
    })),
  } as unknown as ApiClient;
}

function renderReviewScreen(client: ApiClient, initialRoute = '/review?mode=wrong') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/review" element={<ReviewScreen client={client} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 1: Review Client & Candidate/Resume View', () => {
  it('API 클라이언트가 실제 경로와 DTO 규격으로 요청한다', async () => {
    const client = createFakeReviewClient();

    const candidates = await getReviewCandidates(client, 'saa-c03', 'wrong');
    expect(client.get).toHaveBeenCalledWith(
      expect.stringContaining('api/review/candidates?examId=saa-c03&mode=wrong'),
    );
    expect(candidates.total).toBe(2);
    expect(candidates.items[0]?.questionId).toBe('q-w1');

    const current = await getCurrentReviewSession(client, 'saa-c03', 'wrong');
    expect(client.get).toHaveBeenCalledWith(
      expect.stringContaining('api/review/sessions/current?examId=saa-c03&mode=wrong'),
    );
    expect(current).toBeNull();

    const started = await startReviewSession(client, 'saa-c03', 'wrong');
    expect(client.post).toHaveBeenCalledWith('api/review/sessions', {
      json: { examId: 'saa-c03', mode: 'wrong' },
    });
    expect(started.status).toBe('active');
    expect(started.current?.questionId).toBe('q-w1');

    const bookmarks = await listBookmarks(client, 'saa-c03');
    expect(client.get).toHaveBeenCalledWith(
      expect.stringContaining('api/review/bookmarks?examId=saa-c03'),
    );
    expect(bookmarks.total).toBe(0);

    const patched = await setBookmark(client, {
      examId: 'saa-c03',
      questionId: 'q-w1',
      bookmarked: true,
    });
    expect(client.patch).toHaveBeenCalledWith('api/review/bookmarks', {
      json: { examId: 'saa-c03', questionId: 'q-w1', bookmarked: true },
    });
    expect(patched.bookmarked).toBe(true);
  });

  it('오답 복습 후보 목록과 문항 수를 렌더하고 내부 ID는 노출하지 않는다', async () => {
    const client = createFakeReviewClient();
    renderReviewScreen(client, '/review?mode=wrong');

    expect(await screen.findByRole('tab', { name: '오답 복습' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '북마크 복습' })).toBeInTheDocument();

    expect(await screen.findByText(/Amazon S3 수명 주기 정책/)).toBeInTheDocument();
    expect(screen.getByText(/VPC 간 안전한 전송/)).toBeInTheDocument();
    expect(screen.getByText(/복습 대기 2문제/)).toBeInTheDocument();

    expect(screen.queryByText('q-w1')).not.toBeInTheDocument();
    expect(screen.queryByText('q-w2')).not.toBeInTheDocument();
  });

  it('북마크 탭으로 전환 시 북마크 빈 상태를 표시한다', async () => {
    const client = createFakeReviewClient({ bookmarkCandidates: [] });
    renderReviewScreen(client, '/review?mode=wrong');

    const bookmarkTab = await screen.findByRole('tab', { name: '북마크 복습' });
    fireEvent.click(bookmarkTab);

    expect(await screen.findByText(/북마크한 문제가 없습니다/)).toBeInTheDocument();
  });

  it('후보 로드 실패 시 오류 안내와 다시 시도 버튼을 제공한다', async () => {
    const client = createFakeReviewClient({ failCandidates: true });
    renderReviewScreen(client, '/review?mode=wrong');

    expect(await screen.findByText(/목록을 불러오지 못했습니다/)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: '다시 시도' });
    expect(retryBtn).toBeInTheDocument();
  });

  it('복습 시작 버튼 클릭 시 세션을 생성하고 진행 화면으로 진입한다', async () => {
    const client = createFakeReviewClient();
    renderReviewScreen(client, '/review?mode=wrong');

    const startBtn = await screen.findByRole('button', { name: /복습 시작/ });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(client.post).toHaveBeenCalledWith('api/review/sessions', {
        json: { examId: 'saa-c03', mode: 'wrong' },
      });
    });

    expect(await screen.findByText('문제 1 / 2')).toBeInTheDocument();
  });

  it('기존 활성 회차가 있으면 서버 GET current 결과로 복습을 재개한다', async () => {
    const client = createFakeReviewClient({
      activeSession: {
        examId: 'saa-c03',
        mode: 'wrong',
        status: 'active',
        cursor: 1,
        total: 2,
        current: {
          questionId: 'q-w2',
          stem: 'VPC 간 안전한 전송을 구성하기 위해 필요한 리소스는?',
          options: [
            { optionId: 'opt-a', text: 'Transit Gateway' },
            { optionId: 'opt-b', text: 'Internet Gateway' },
          ],
          response: null,
        },
      },
    });

    renderReviewScreen(client, '/review?mode=wrong');

    expect(await screen.findByText('문제 2 / 2')).toBeInTheDocument();
    expect(screen.getByText(/VPC 간 안전한 전송/)).toBeInTheDocument();
    expect(screen.queryByText('q-w2')).not.toBeInTheDocument();
  });
});
