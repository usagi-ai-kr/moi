import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudySubmittedSet } from '../../src/ui/api/client';
import { isSubmittedSet } from '../../src/ui/api/client';
import { ResultView } from '../../src/ui/study/ResultView';

// #176 결과 계약 — 서버 제출 DTO 그대로(answerOptionIds 있음·answerCount 없음).
// 직접 타입 표기로 강제한다(`as` 우회 금지): 구 타입에서는 typecheck가 실패한다(Red).
const serverSubmittedSet: StudySubmittedSet = {
  id: 'set-1',
  userId: 'u-1',
  examId: 'saa-c03',
  mode: 'all',
  status: 'submitted',
  createdAt: 1700000000000,
  submittedAt: 1700000001000,
  items: [
    {
      questionId: 'q-0',
      questionVersionId: 'qv-0',
      versionNo: 1,
      optionOrder: ['q-0-a', 'q-0-b'],
      stem: '문제 0 본문',
      options: [
        { optionId: 'q-0-a', text: '보기 A' },
        { optionId: 'q-0-b', text: '보기 B' },
      ],
      answerOptionIds: ['q-0-a'],
      response: { kind: 'answered', optionIds: ['q-0-a'] },
      explanation: '문제 0 해설',
      sourceUrls: ['https://docs.aws.amazon.com/q-0'],
    },
  ],
  result: {
    answeredCount: 1,
    correctCount: 1,
    accuracyPercent: 100,
    passCount: 0,
    unansweredCount: 0,
    perItem: [
      {
        questionId: 'q-0',
        responseKind: 'answered',
        selectedOptionIds: ['q-0-a'],
        correctOptionIds: ['q-0-a'],
        correct: true,
      },
    ],
  },
};

function fakeClient(): ApiClient {
  return {
    get: vi.fn(() => ({
      json: async () => ({ examId: 'saa-c03', total: 0, items: [] }),
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function renderInRouter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/study/result']}>
        <Routes>
          <Route
            path="/study/result"
            element={
              <ResultView client={fakeClient()} set={serverSubmittedSet} onRestart={() => {}} onHistory={() => {}} />
            }
          />
          <Route path="/review" element={<div>review stub</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('결과 계약 (#176)', () => {
  it('서버 제출 DTO를 StudySubmittedSet으로 판별한다', () => {
    expect(isSubmittedSet(serverSubmittedSet)).toBe(true);
  });

  it('오답 바로가기 클릭은 풀 리로드 없이 /review?mode=wrong으로 이동한다', async () => {
    renderInRouter();
    const wrongLink = screen.getByRole('link', { name: /오답 복습/ });
    expect(wrongLink).toHaveAttribute('href', '/review?mode=wrong');
    expect(screen.getByRole('link', { name: /북마크 복습/ })).toHaveAttribute('href', '/review?mode=bookmark');
    fireEvent.click(wrongLink);
    expect(await screen.findByText('review stub')).toBeInTheDocument();
  });

  it('라우터 없이 렌더하면 항상 Link이므로 실패한다(anchor 폴백 없음)', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() =>
      render(
        <QueryClientProvider client={queryClient}>
          <ResultView client={fakeClient()} set={serverSubmittedSet} onRestart={() => {}} onHistory={() => {}} />
        </QueryClientProvider>,
      ),
    ).toThrow();
  });
});
