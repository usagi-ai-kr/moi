import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { ReviewScreen } from '../../src/ui/review/ReviewScreen';
import { BookmarkButton } from '../../src/ui/review/BookmarkButton';
import { ResultView } from '../../src/ui/study/ResultView';

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

interface FakeReviewClientPhase2Options {
  activeSession?: {
    examId: string;
    mode: 'wrong' | 'bookmark';
    status: 'active';
    cursor: number;
    total: number;
    current: {
      questionId: string;
      stem: string;
      options: Array<{ optionId: string; text: string }>;
      answerCount: number;
      response: null;
    } | null;
  } | null;
  currentError?: number;
  answerResponse?: {
    correct: boolean;
    graded: {
      questionId: string;
      response: unknown;
      correct: boolean;
      explanation: string;
      sourceUrls: string[];
      correctOptionIds: string[];
    };
    session: {
      examId: string;
      mode: 'wrong' | 'bookmark';
      status: 'active';
      cursor: number;
      total: number;
    };
    next: {
      questionId: string;
      stem: string;
      options: Array<{ optionId: string; text: string }>;
      answerCount: number;
    } | null;
  };
  failAnswer?: boolean;
  endSummary?: {
    total: number;
    graded: number;
    pending: number;
    correct: number;
  };
  bookmarks?: string[];
  failBookmark?: boolean;
}

function createFakePhase2Client(opts: FakeReviewClientPhase2Options = {}): {
  client: ApiClient;
  postCalls: Array<{ path: string; json: unknown }>;
  patchCalls: Array<{ path: string; json: unknown }>;
} {
  const postCalls: Array<{ path: string; json: unknown }> = [];
  const patchCalls: Array<{ path: string; json: unknown }> = [];
  const currentBookmarks = new Set(opts.bookmarks ?? ['q-bm1']);

  const client = {
    get: vi.fn((path: string) => ({
      json: async () => {
        const u = new URL(String(path), 'http://localhost/');
        if (u.pathname === '/api/review/sessions/current') {
          if (opts.currentError) {
            throw httpError(opts.currentError, { error: 'internal' });
          }
          if (opts.activeSession === undefined) {
            return {
              examId: 'saa-c03',
              mode: 'wrong',
              status: 'active',
              cursor: 0,
              total: 2,
              current: {
                questionId: 'q-w1',
                stem: 'S3 비용 절감 수명 주기 정책은?',
                options: [
                  { optionId: 'opt-a', text: 'Glacier 즉시 전환' },
                  { optionId: 'opt-b', text: 'Intelligent-Tiering 전환' },
                ],
                answerCount: 1,
                response: null,
              },
              exhausted: false,
              items: [{ questionId: 'q-w1', response: null }],
            };
          }
          if (opts.activeSession === null) {
            throw httpError(404, { error: 'not_found' });
          }
          return {
            ...opts.activeSession,
            exhausted: opts.activeSession.current === null,
            items: opts.activeSession.current ? [{ questionId: opts.activeSession.current.questionId, response: null }] : [],
          };
        }
        if (u.pathname === '/api/review/bookmarks') {
          return {
            examId: 'saa-c03',
            total: currentBookmarks.size,
            items: Array.from(currentBookmarks).map((id) => ({
              questionId: id,
              stem: `북마크 문제 ${id}`,
              options: [{ optionId: 'opt-1', text: '보기 1' }],
            })),
          };
        }
        if (u.pathname === '/api/review/candidates') {
          return { examId: 'saa-c03', mode: 'wrong', total: 0, items: [] };
        }
        return {};
      },
    })),
    post: vi.fn((path: string, options?: { json?: unknown }) => ({
      json: async () => {
        postCalls.push({ path: String(path), json: options?.json });
        if (path === 'api/review/sessions/current/answers') {
          if (opts.failAnswer) {
            throw httpError(500, { error: 'internal' });
          }
          return (
            opts.answerResponse ?? {
              correct: true,
              graded: {
                questionId: 'q-w1',
                response: options?.json,
                correct: true,
                explanation: 'Intelligent-Tiering이 가장 적합합니다.',
                sourceUrls: ['https://docs.aws.amazon.com/s3/pricing'],
                correctOptionIds: ['opt-b'],
              },
              session: {
                examId: 'saa-c03',
                mode: 'wrong',
                status: 'active',
                cursor: 1,
                total: 2,
              },
              next: {
                questionId: 'q-w2',
                stem: 'VPC 피어링 연결 주의사항은?',
                options: [
                  { optionId: 'opt-c', text: 'CIDR 중복 방지' },
                  { optionId: 'opt-d', text: '게이트웨이 불필요' },
                ],
                answerCount: 1,
              },
            }
          );
        }
        if (path === 'api/review/sessions/current/end') {
          return {
            examId: 'saa-c03',
            mode: 'wrong',
            status: 'ended',
            summary: opts.endSummary ?? {
              total: 2,
              graded: 1,
              pending: 1,
              correct: 1,
            },
          };
        }
        return {};
      },
    })),
    patch: vi.fn((path: string, options?: { json?: unknown }) => ({
      json: async () => {
        patchCalls.push({ path: String(path), json: options?.json });
        if (opts.failBookmark) {
          throw httpError(500, { error: 'internal' });
        }
        const body = options?.json as { examId: string; questionId: string; bookmarked: boolean };
        if (body?.bookmarked) {
          currentBookmarks.add(body.questionId);
        } else if (body) {
          currentBookmarks.delete(body.questionId);
        }
        return {
          questionId: body?.questionId,
          bookmarked: body?.bookmarked,
        };
      },
    })),
  } as unknown as ApiClient;

  return { client, postCalls, patchCalls };
}

function renderReviewWithRouter(client: ApiClient, initialRoute = '/review?mode=wrong') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="review" element={<ReviewScreen client={client} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('복습 Phase 2 채점·해설·종료·북마크 UI', () => {
  it('1. pregrade 상태: 정답/해설/근거가 없고, 보기 미선택 시 답안 제출 버튼이 비활성화된다', async () => {
    const { client } = createFakePhase2Client();
    renderReviewWithRouter(client);

    expect(await screen.findByText('S3 비용 절감 수명 주기 정책은?')).toBeInTheDocument();
    expect(screen.queryByText('Intelligent-Tiering이 가장 적합합니다.')).not.toBeInTheDocument();
    expect(screen.queryByText(/공식 근거/)).not.toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /답안 제출|제출하기/ });
    expect(submitBtn).toBeDisabled();

    const passBtn = screen.getByRole('button', { name: /Pass|건너뛰기/i });
    expect(passBtn).not.toBeDisabled();
  });

  it('2. 보기 다중 선택 후 제출하면 POST answers를 전송하고, 성공 시 정답·해설·공식근거를 렌더한다', async () => {
    const { client, postCalls } = createFakePhase2Client();
    renderReviewWithRouter(client);

    const checkbox = await screen.findByRole('checkbox', { name: /Intelligent-Tiering 전환/ });
    fireEvent.click(checkbox);

    const submitBtn = screen.getByRole('button', { name: /답안 제출|제출하기/ });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => expect(postCalls.length).toBe(1));
    expect(postCalls[0].path).toBe('api/review/sessions/current/answers');
    expect(postCalls[0].json).toEqual({
      examId: 'saa-c03',
      mode: 'wrong',
      questionId: 'q-w1',
      response: {
        kind: 'answered',
        optionIds: ['opt-b'],
      },
    });

    expect(await screen.findByText('Intelligent-Tiering이 가장 적합합니다.')).toBeInTheDocument();
    const sourceLink = screen.getByRole('link', { name: 'Pricing' });
    expect(sourceLink).toHaveAttribute('href', 'https://docs.aws.amazon.com/s3/pricing');
    expect(sourceLink).toHaveAttribute('title', 'https://docs.aws.amazon.com/s3/pricing');
    expect(sourceLink).not.toHaveTextContent(/https?:\/\//);

    // 다음 문항 정답은 아직 미노출
    expect(screen.queryByText('CIDR 중복 방지')).not.toBeInTheDocument();

    // 다음 문제 버튼 클릭 시 다음 문항으로 전환
    const nextBtn = screen.getByRole('button', { name: /다음 문제|다음/ });
    fireEvent.click(nextBtn);

    expect(await screen.findByText('VPC 피어링 연결 주의사항은?')).toBeInTheDocument();
    expect(screen.queryByText('Intelligent-Tiering이 가장 적합합니다.')).not.toBeInTheDocument();
  });

  it('3. Pass 선택 시 { kind: "pass" }를 제출하고 피드백을 노출한다', async () => {
    const { client, postCalls } = createFakePhase2Client();
    renderReviewWithRouter(client);

    const passBtn = await screen.findByRole('button', { name: /Pass|건너뛰기/i });
    fireEvent.click(passBtn);

    await waitFor(() => expect(postCalls.length).toBe(1));
    expect(postCalls[0].path).toBe('api/review/sessions/current/answers');
    expect(postCalls[0].json).toEqual({
      examId: 'saa-c03',
      mode: 'wrong',
      questionId: 'q-w1',
      response: { kind: 'pass' },
    });

    expect(await screen.findByText('Intelligent-Tiering이 가장 적합합니다.')).toBeInTheDocument();
  });

  it('4. 답안 제출 중에는 중복 제출(double POST)이 차단된다', async () => {
    let resolveAnswer: (v: unknown) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveAnswer = resolve;
    });

    const postCalls: Array<{ path: string; json: unknown }> = [];
    const client = {
      get: vi.fn(() => ({
        json: async () => ({
          examId: 'saa-c03',
          mode: 'wrong',
          status: 'active',
          cursor: 0,
          total: 1,
          current: {
            questionId: 'q-w1',
            stem: '중복 클릭 방지 문항',
            options: [{ optionId: 'opt-1', text: '보기 1' }],
            answerCount: 1,
            response: null,
          },
          exhausted: false,
          items: [{ questionId: 'q-w1', response: null }],
        }),
      })),
      post: vi.fn((path: string, options?: { json?: unknown }) => ({
        json: async () => {
          postCalls.push({ path: String(path), json: options?.json });
          return pendingPromise;
        },
      })),
      patch: vi.fn(),
    } as unknown as ApiClient;

    renderReviewWithRouter(client);

    const checkbox = await screen.findByRole('checkbox', { name: /보기 1/ });
    fireEvent.click(checkbox);

    const submitBtn = screen.getByRole('button', { name: /답안 제출|제출하기/ });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());

    fireEvent.click(submitBtn);
    await waitFor(() => expect(postCalls.length).toBe(1));
    expect(submitBtn).toBeDisabled();

    // 두 번째 클릭 시에도 추가 호출 없음
    fireEvent.click(submitBtn);
    expect(postCalls.length).toBe(1);

    resolveAnswer({
      correct: true,
      graded: {
        questionId: 'q-w1',
        response: { kind: 'answered', optionIds: ['opt-1'] },
        correct: true,
        explanation: '해설',
        sourceUrls: [],
        correctOptionIds: ['opt-1'],
      },
      session: { examId: 'saa-c03', mode: 'wrong', status: 'ended', cursor: 1, total: 1 },
      next: null,
    });
  });

  it('5. 답안 제출 실패 시 오류 안내가 표시되고 선택한 보기가 보존되며 재시도 가능하다', async () => {
    const { client, postCalls } = createFakePhase2Client({ failAnswer: true });
    renderReviewWithRouter(client);

    const checkbox = await screen.findByRole('checkbox', { name: /Intelligent-Tiering 전환/ });
    fireEvent.click(checkbox);

    const submitBtn = screen.getByRole('button', { name: /답안 제출|제출하기/ });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.click(submitBtn);

    await waitFor(() => expect(postCalls.length).toBe(1));
    expect(await screen.findByText(/제출에 실패했습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it('6. 복습 진행 중 종료 요청 시 답안 POST 없이 end만 호출하고 요약을 표시한다', async () => {
    const { client, postCalls } = createFakePhase2Client();
    renderReviewWithRouter(client);

    await screen.findByText('S3 비용 절감 수명 주기 정책은?');
    const endBtn = screen.getByRole('button', { name: /복습 종료|종료하기/ });
    fireEvent.click(endBtn);

    await waitFor(() => expect(postCalls.length).toBe(1));
    expect(postCalls[0].path).toBe('api/review/sessions/current/end');
    expect(postCalls[0].json).toEqual({
      examId: 'saa-c03',
      mode: 'wrong',
    });

    expect(await screen.findByText(/복습이 종료되었습니다|복습 요약/)).toBeInTheDocument();
    expect(screen.getByText(/총 2문제 중 1문제 완료/)).toBeInTheDocument();
  });

  it('7. BookmarkButton: 북마크 상태 표시 및 추가/해제 PATCH를 호출한다', async () => {
    const { client, patchCalls } = createFakePhase2Client({ bookmarks: ['q-bm1'] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <BookmarkButton client={client} examId="saa-c03" questionId="q-bm1" />
      </QueryClientProvider>,
    );

    const btn = await screen.findByRole('button', { name: /북마크 해제|북마크 취소/ });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);

    await waitFor(() => expect(patchCalls.length).toBe(1));
    expect(patchCalls[0].path).toBe('api/review/bookmarks');
    expect(patchCalls[0].json).toEqual({
      examId: 'saa-c03',
      questionId: 'q-bm1',
      bookmarked: false,
    });
  });

  it('8. currentQuery가 500 오류인 경우 활성 회차 없음으로 넘어가지 않고 오류 및 재시도를 표시한다', async () => {
    const { client } = createFakePhase2Client({ currentError: 500 });
    renderReviewWithRouter(client);

    expect(await screen.findByText(/복습 정보를 불러오지 못했습니다|오류가 발생했습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument();
    expect(screen.queryByText(/대기 중인/)).not.toBeInTheDocument();
  });

  it('9. ResultView의 오답·북마크 복습 바로가기는 SPA 링크이고 이동 후 해당 탭이 선택된다', async () => {
    const mockSet = {
      id: 'set-1',
      userId: 'u-1',
      examId: 'saa-c03',
      mode: 'all' as const,
      status: 'submitted' as const,
      createdAt: 1700000000000,
      submittedAt: 1700000001000,
      items: [
        {
          questionId: 'q-w1',
          questionVersionId: 'qv-w1',
          versionNo: 1,
          optionOrder: ['opt-a', 'opt-b'],
          stem: 'S3 비용 절감 문제',
          options: [
            { optionId: 'opt-a', text: '보기 A' },
            { optionId: 'opt-b', text: '보기 B' },
          ],
          answerOptionIds: ['opt-b'],
          response: { kind: 'unanswered' as const },
          explanation: '해설 내용',
          sourceUrls: [],
        },
      ],
      result: {
        answeredCount: 0,
        correctCount: 0,
        accuracyPercent: 0,
        passCount: 0,
        unansweredCount: 1,
        perItem: [
          {
            questionId: 'q-w1',
            responseKind: 'unanswered',
            selectedOptionIds: [],
            correctOptionIds: ['opt-b'],
            correct: false,
          },
        ],
      },
    };

    function renderResult() {
      const { client } = createFakePhase2Client();
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/study/result']}>
            <Routes>
              <Route
                path="/study/result"
                element={<ResultView client={client} set={mockSet} onRestart={() => {}} onHistory={() => {}} />}
              />
              <Route path="/review" element={<ReviewScreen client={client} />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    }

    const first = renderResult();
    const wrongLink = screen.getByRole('link', { name: /오답 복습/ });
    expect(wrongLink).toHaveAttribute('href', '/review?mode=wrong');
    expect(screen.getByRole('link', { name: /북마크 복습/ })).toHaveAttribute('href', '/review?mode=bookmark');
    expect(first.container.querySelector('[aria-label="북마크 추가"]')).toBeInTheDocument();

    // raw <a>면 jsdom 풀 내비게이션이라 복습 탭이 렌더되지 않는다.
    fireEvent.click(wrongLink);
    expect(await screen.findByRole('tab', { name: /오답 복습/ })).toHaveAttribute('aria-selected', 'true');
    first.unmount();

    renderResult();
    fireEvent.click(screen.getByRole('link', { name: /북마크 복습/ }));
    expect(await screen.findByRole('tab', { name: /북마크 복습/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('10. 복습 시작(start) 시 409가 발생하면 current를 재조회하여 활성 회차로 재개한다', async () => {
    let currentCallCount = 0;
    const postCalls: Array<{ path: string; json: unknown }> = [];

    const client = {
      get: vi.fn((path: string) => ({
        json: async () => {
          const u = new URL(String(path), 'http://localhost/');
          if (u.pathname === '/api/review/sessions/current') {
            currentCallCount++;
            if (currentCallCount === 1) {
              throw httpError(404, { error: 'not_found' });
            }
            return {
              examId: 'saa-c03',
              mode: 'wrong',
              status: 'active',
              cursor: 0,
              total: 1,
              current: {
                questionId: 'q-409',
                stem: '409 재개된 활성 문항',
                options: [{ optionId: 'opt-1', text: '재개 보기 1' }],
                answerCount: 1,
                response: null,
              },
              exhausted: false,
              items: [{ questionId: 'q-409', response: null }],
            };
          }
          if (u.pathname === '/api/review/candidates') {
            return {
              examId: 'saa-c03',
              mode: 'wrong',
              total: 1,
              items: [
                {
                  questionId: 'q-409',
                  validWrongCount: 1,
                  stem: '후보 문항',
                  options: [{ optionId: 'opt-1', text: '보기 1' }],
                },
              ],
            };
          }
          return {};
        },
      })),
      post: vi.fn((path: string, opts?: { json?: unknown }) => ({
        json: async () => {
          postCalls.push({ path: String(path), json: opts?.json });
          if (path === 'api/review/sessions') {
            throw httpError(409, { error: 'active_session_exists' });
          }
          return {};
        },
      })),
      patch: vi.fn(),
    } as unknown as ApiClient;

    renderReviewWithRouter(client);

    const startBtn = await screen.findByRole('button', { name: /복습 시작하기/ });
    fireEvent.click(startBtn);

    await waitFor(() => expect(postCalls.length).toBe(1));
    expect(await screen.findByText('409 재개된 활성 문항')).toBeInTheDocument();
  });

  it('11. 답안 제출 시 401 unauth 응답인 경우 로그인 안내를 표시한다', async () => {
    const { client } = createFakePhase2Client();
    client.post = vi.fn(((path: string) => ({
      json: async () => {
        if (path === 'api/review/sessions/current/answers') {
          throw httpError(401, { error: 'unauthorized' });
        }
        return {};
      },
    })) as never);

    renderReviewWithRouter(client);

    const checkbox = await screen.findByRole('checkbox', { name: /Intelligent-Tiering 전환/ });
    fireEvent.click(checkbox);

    const submitBtn = screen.getByRole('button', { name: /답안 제출|제출하기/ });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/로그인이 필요합니다/)).toBeInTheDocument();
  });

  it('12. BookmarkButton PATCH 실패 시 다시 시도 메시지를 표시한다', async () => {
    const { client } = createFakePhase2Client({ failBookmark: true });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <BookmarkButton client={client} examId="saa-c03" questionId="q-bm1" />
      </QueryClientProvider>,
    );

    const btn = await screen.findByRole('button', { name: /북마크/ });
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);

    expect(await screen.findByText('다시 시도')).toBeInTheDocument();
  });
});
