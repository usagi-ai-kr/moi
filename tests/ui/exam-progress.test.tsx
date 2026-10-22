import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExamProgress } from '../../src/ui/exam/ExamProgress';
import { ExamScopeContext, type ExamScopeValue } from '../../src/ui/exam/ExamScopeProvider';
import { examProgressQueryKey, toExamProgressPercent } from '../../src/ui/exam/progress-query';
import type { ApiClient, StudyStats } from '../../src/ui/api/client';

const saaScope: ExamScopeValue = {
  code: 'saa-c03',
  examId: 'saa-c03',
  label: 'AWS SAA-C03',
  exams: [{ code: 'saa-c03', label: 'AWS SAA-C03', fullLabel: 'AWS Solutions Architect Associate' }],
  setExam: () => {},
};

function stats(coverage: number, examId = 'saa-c03', totalQuestions = 500): StudyStats {
  return {
    examId,
    totalQuestions,
    domainQuestionCounts: {},
    uniqueFirstSolved: Math.round(coverage * totalQuestions),
    coverage,
    overallAccuracy: null,
    domains: [],
    weakDomains: [],
  };
}

function clientFor(result: Promise<StudyStats>): ApiClient {
  return {
    get: vi.fn(() => ({ json: () => result })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function tree(
  queryClient: QueryClient,
  client: ApiClient,
  userId = 'user-a',
  scope = saaScope,
) {
  return (
    <QueryClientProvider client={queryClient}>
      <ExamScopeContext.Provider value={scope}>
        <ExamProgress client={client} userId={userId} />
      </ExamScopeContext.Provider>
    </QueryClientProvider>
  );
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('#353 시험 전체 진척도 변환과 격리', () => {
  it.each([
    [0, 0],
    [0.001, 0.1],
    [0.37, 37],
    [1, 100],
  ])('서버 coverage %s를 %s%% 단위로 표시한다', (coverage, expected) => {
    expect(toExamProgressPercent(stats(coverage), 'saa-c03')).toBe(expected);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01])('잘못된 coverage %s를 숨긴다', (coverage) => {
    expect(toExamProgressPercent(stats(coverage), 'saa-c03')).toBeNull();
  });

  it('분모가 없으면 0%를 꾸며 표시하지 않는다', () => {
    expect(toExamProgressPercent(stats(0, 'saa-c03', 0), 'saa-c03')).toBeNull();
  });

  it('응답 시험이 선택 시험과 다르면 진척도를 숨긴다', () => {
    expect(toExamProgressPercent(stats(0.37, 'exam-other'), 'saa-c03')).toBeNull();
  });

  it('query key를 계정과 시험별로 분리한다', () => {
    expect(examProgressQueryKey('saa-c03', 'user-a')).not.toEqual(examProgressQueryKey('sap', 'user-a'));
    expect(examProgressQueryKey('saa-c03', 'user-a')).not.toEqual(examProgressQueryKey('saa-c03', 'user-b'));
  });

  it('API 실패 시 0%가 아니라 미조회 표시를 제공한다', async () => {
    const client = clientFor(Promise.reject(new Error('offline')));
    render(tree(newQueryClient(), client));

    expect(await screen.findByRole('status', { name: 'AWS SAA-C03 학습 진척도를 표시할 수 없습니다' })).toHaveTextContent('—');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('0%', { exact: true })).not.toBeInTheDocument();
  });

  it('소수점 첫째 자리까지 시각·접근성 값에 반영한다', async () => {
    const client = clientFor(Promise.resolve(stats(0.001)));
    render(tree(newQueryClient(), client));

    const progress = await screen.findByRole('progressbar', { name: 'AWS SAA-C03 학습 진척도 0.1퍼센트' });
    expect(progress).toHaveAttribute('aria-valuenow', '0.1');
    expect(progress).toHaveAttribute('aria-valuetext', '0.1%');
    expect(progress).toHaveTextContent('0.1%');
  });

  it.each([
    ['계정', 'user-b', 'saa-c03', 'AWS SAA-C03'],
    ['시험', 'user-a', 'sap', 'SAP'],
  ])('이전 %s 값은 새 query가 대기 중일 때 보이지 않는다', async (_kind, userId, examId, label) => {
    let resolveNext!: (value: StudyStats) => void;
    const next = new Promise<StudyStats>((resolve) => {
      resolveNext = resolve;
    });
    const queryClient = newQueryClient();
    const firstClient = clientFor(Promise.resolve(stats(0.37)));
    const secondClient = clientFor(next);
    const { rerender } = render(tree(queryClient, firstClient));

    expect(await screen.findByRole('progressbar', { name: 'AWS SAA-C03 학습 진척도 37퍼센트' })).toBeVisible();
    const nextScope = { ...saaScope, code: examId, examId, label };
    rerender(tree(queryClient, secondClient, userId, nextScope));

    expect(screen.queryByText('37%', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(await screen.findByRole('status', { name: `${label} 학습 진척도 불러오는 중` })).toBeInTheDocument();

    resolveNext(stats(0.82, examId));
    expect(await screen.findByRole('progressbar', { name: `${label} 학습 진척도 82퍼센트` })).toBeVisible();
  });
});
