import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyCorrections, StudySubmittedSet } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { ResultView } from '../../src/ui/study/ResultView';

function fakeClient(): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).includes('api/review/bookmarks')) {
          return { examId: 'saa-c03', total: 0, items: [] };
        }
        return {};
      },
    })),
    patch: vi.fn(() => ({
      json: async () => ({ questionId: 'q', bookmarked: true }),
    })),
    post: vi.fn(),
  } as unknown as ApiClient;
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// 2문제 제출 세트 — 최초 정답률 50% (q-0 정답, q-1 오답).
function submittedSet(): StudySubmittedSet {
  const items = [0, 1].map((i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`],
    stem: `문제 ${i} 본문`,
    options: [
      { optionId: `q-${i}-a`, text: '보기 A' },
      { optionId: `q-${i}-b`, text: '보기 B' },
    ],
    answerCount: 1,
    response: { kind: 'answered' as const, optionIds: [`q-${i}-a`] },
    explanation: `문제 ${i} 해설`,
    sourceUrls: [],
  }));
  return {
    id: 'set-1',
    userId: 'u-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'submitted',
    createdAt: 1700000000000,
    submittedAt: 1700000001000,
    items,
    result: {
      answeredCount: 2,
      correctCount: 1,
      accuracyPercent: 50,
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
        {
          questionId: 'q-1',
          responseKind: 'answered',
          selectedOptionIds: ['q-1-a'],
          correctOptionIds: ['q-1-b'],
          correct: false,
        },
      ],
    },
  } as StudySubmittedSet;
}

// 오답 문항(qv-1) 1건을 정정 제외 — 유효 1문제·정정 정답률 100%.
function correctionsFixture(): StudyCorrections {
  return {
    items: [
      {
        id: 'c-1',
        setId: 'set-1',
        questionId: 'q-1',
        questionVersionId: 'qv-1',
        reason: 'typo',
        source: 'admin',
        actor: 'system',
        createdAt: 1700000002000,
      },
    ],
    corrected: {
      answeredCount: 1,
      correctCount: 1,
      accuracyPercent: 100,
      passCount: 0,
      unansweredCount: 0,
      ungraded: false,
      validTotal: 1,
      excludedCount: 1,
      excludedQuestionVersionIds: ['qv-1'],
      perItem: [
        {
          questionId: 'q-0',
          responseKind: 'answered',
          selectedOptionIds: ['q-0-a'],
          correctOptionIds: ['q-0-a'],
          correct: true,
          excluded: false,
        },
        {
          questionId: 'q-1',
          responseKind: 'answered',
          selectedOptionIds: ['q-1-a'],
          correctOptionIds: ['q-1-b'],
          correct: false,
          excluded: true,
        },
      ],
    },
  };
}

describe('정정 결과 UI (#53)', () => {
  it('정정 1건이면 정정 반영·최초/정정 정답률·유효/제외·사유를 보인다', () => {
    renderWithQuery(
      <ResultView
        client={fakeClient()}
        set={submittedSet()}
        onRestart={() => {}}
        onHistory={() => {}}
        corrections={correctionsFixture()}
      />,
    );
    expect(screen.getByText(copy.study.correctionTitle)).toBeInTheDocument();
    expect(screen.getByText('최초 정답률 50% → 정정 정답률 100%')).toBeInTheDocument();
    expect(screen.getByText('유효 1문제 · 제외 1문제')).toBeInTheDocument();
    expect(screen.getByText(`문제 2 · ${copy.report.reasonTypo}`)).toBeInTheDocument();
  });

  it('정정 0건이면 정정 반영을 보이지 않는다', () => {
    renderWithQuery(
      <ResultView
        client={fakeClient()}
        set={submittedSet()}
        onRestart={() => {}}
        onHistory={() => {}}
        corrections={{ items: [], corrected: { ...correctionsFixture().corrected, validTotal: 2, excludedCount: 0, accuracyPercent: 50 } }}
      />,
    );
    expect(screen.queryByText(copy.study.correctionTitle)).not.toBeInTheDocument();
    // 기존 결과 화면은 그대로 둔다.
    expect(screen.getByText(copy.study.resultTitle)).toBeInTheDocument();
  });

  it('정정 정답률이 null이면 채점 불가를 보인다', () => {
    const corrections: StudyCorrections = {
      items: [
        {
          id: 'c-1',
          setId: 'set-1',
          questionId: 'q-0',
          questionVersionId: 'qv-0',
          reason: 'answer',
          source: 'admin',
          actor: 'system',
          createdAt: 1700000002000,
        },
        {
          id: 'c-2',
          setId: 'set-1',
          questionId: 'q-1',
          questionVersionId: 'qv-1',
          reason: 'typo',
          source: 'admin',
          actor: 'system',
          createdAt: 1700000003000,
        },
      ],
      corrected: {
        answeredCount: 0,
        correctCount: 0,
        accuracyPercent: null,
        passCount: 0,
        unansweredCount: 0,
        ungraded: true,
        validTotal: 0,
        excludedCount: 2,
        excludedQuestionVersionIds: ['qv-0', 'qv-1'],
        perItem: [],
      },
    };
    renderWithQuery(
      <ResultView
        client={fakeClient()}
        set={submittedSet()}
        onRestart={() => {}}
        onHistory={() => {}}
        corrections={corrections}
      />,
    );
    expect(screen.getByText(copy.study.correctionTitle)).toBeInTheDocument();
    expect(screen.getByText('최초 정답률 50% → 정정 정답률 채점 불가')).toBeInTheDocument();
  });
});
