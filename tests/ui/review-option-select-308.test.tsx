// #308 — 복습 화면도 단일 선택 radio semantics로 일관되게 (BDD AC).
// Given 본 학습·복습 When 동일 문항 조회 Then 선택 개수와 컴포넌트 semantics가 일관된다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import type { ReviewPendingItem } from '../../src/ui/api/review-client';
import { ReviewQuestion } from '../../src/ui/review/ReviewQuestion';
import { ReviewScreen } from '../../src/ui/review/ReviewScreen';

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request('http://localhost/api/test'),
    {} as never,
  );
}

function fakeClient(): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function reviewItem(answers = 1): ReviewPendingItem {
  return {
    questionId: 'q-w1',
    stem: '복습 단일 선택 본문',
    options: [
      { optionId: 'opt-a', text: '보기 A' },
      { optionId: 'opt-b', text: '보기 B' },
    ],
    answerCount: answers,
    response: null,
  };
}

function withProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('#308 복습 렌더 semantics', () => {
  it('정답 1개 문항은 보기를 radio로 렌더한다(학습과 일관)', () => {
    withProviders(
      <ReviewQuestion
        client={fakeClient()}
        examId="saa-c03"
        item={reviewItem(1)}
        cursor={0}
        total={2}
        selectedOptions={[]}
        isSubmitting={false}
        errorMsg={null}
        onToggleOption={vi.fn()}
        onSubmit={vi.fn()}
        onPass={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('보기 1 보기 A')).toHaveAttribute('type', 'radio');
    expect(screen.getByLabelText('보기 2 보기 B')).toHaveAttribute('type', 'radio');
  });

  it('정답 2개 문항은 checkbox semantics를 유지한다', () => {
    withProviders(
      <ReviewQuestion
        client={fakeClient()}
        examId="saa-c03"
        item={reviewItem(2)}
        cursor={0}
        total={2}
        selectedOptions={[]}
        isSubmitting={false}
        errorMsg={null}
        onToggleOption={vi.fn()}
        onSubmit={vi.fn()}
        onPass={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('보기 1 보기 A')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('보기 2 보기 B')).toHaveAttribute('type', 'checkbox');
  });
});

describe('#308 복습 제출 payload (회차 흐름)', () => {
  function makeClient(postCalls: Array<{ json: unknown }>, current: ReviewPendingItem): ApiClient {
    return {
      get: vi.fn((path: string) => ({
        json: async () => {
          const u = new URL(String(path), 'http://localhost/');
          if (u.pathname === '/api/review/sessions/current') {
            return {
              examId: 'saa-c03',
              mode: 'wrong',
              status: 'active',
              cursor: 0,
              total: 1,
              current,
              exhausted: false,
              items: [{ questionId: current.questionId, response: null }],
            };
          }
          if (u.pathname === '/api/review/candidates') {
            return { examId: 'saa-c03', mode: 'wrong', total: 1, items: [] };
          }
          throw httpError(404, { error: 'not_found' });
        },
      })),
      post: vi.fn((path: string, opts?: { json?: unknown }) => ({
        json: async () => {
          if (String(path) === 'api/review/sessions/current/answers') {
            postCalls.push({ json: opts?.json });
            return {
              correct: true,
              graded: {
                questionId: current.questionId,
                response: opts?.json,
                correct: true,
                explanation: '해설',
                sourceUrls: [],
                correctOptionIds: ['opt-b'],
              },
              session: { examId: 'saa-c03', mode: 'wrong', status: 'active', cursor: 1, total: 1 },
              next: null,
            };
          }
          throw httpError(404, { error: 'not_found' });
        },
      })),
      patch: vi.fn(),
    } as unknown as ApiClient;
  }

  function renderReview(client: ApiClient) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/review?mode=wrong']}>
          <Routes>
            <Route path="/review" element={<ReviewScreen client={client} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('단일 선택: 보기 A 후 B를 제출하면 payload optionIds는 정확히 [B]다', async () => {
    const postCalls: Array<{ json: unknown }> = [];
    renderReview(makeClient(postCalls, reviewItem(1)));

    await screen.findByText('복습 단일 선택 본문');
    fireEvent.click(screen.getByText('1. 보기 A'));
    fireEvent.click(screen.getByText('2. 보기 B'));
    // radio 계약 — 새 보기 하나만 남고 이전 선택은 자동 해제된다(제출 전에 확인한다).
    expect(screen.getByLabelText('보기 2 보기 B')).toBeChecked();
    expect(screen.getByLabelText('보기 1 보기 A')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '답안 제출' }));

    await waitFor(() => expect(postCalls).toHaveLength(1));
    expect((postCalls[0].json as { response: { optionIds: string[] } }).response).toEqual({
      kind: 'answered',
      optionIds: ['opt-b'],
    });
  });

  it('복수(정답 2개): 보기 A·B 누적 선택이 payload [A, B]로 유지된다', async () => {
    const postCalls: Array<{ json: unknown }> = [];
    // 복수 선택 문항(정답 2개)은 checkbox 계약 — 누적 선택이 유지된다.
    renderReview(makeClient(postCalls, reviewItem(2)));

    await screen.findByText('복습 단일 선택 본문');
    fireEvent.click(screen.getByText('1. 보기 A'));
    fireEvent.click(screen.getByText('2. 보기 B'));
    expect(screen.getByLabelText('보기 1 보기 A')).toBeChecked();
    expect(screen.getByLabelText('보기 2 보기 B')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '답안 제출' }));

    await waitFor(() => expect(postCalls).toHaveLength(1));
    expect((postCalls[0].json as { response: { optionIds: string[] } }).response).toEqual({
      kind: 'answered',
      optionIds: ['opt-a', 'opt-b'],
    });
  });
});
