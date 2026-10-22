import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyStats } from '../../src/ui/api/client';
import { ScopeProgressView } from '../../src/ui/study/ScopeProgress';
import { studyStatsQueryKey } from '../../src/ui/stats/useStudyStats';

const stats: StudyStats = {
  examId: 'saa-c03', totalQuestions: 500, domainQuestionCounts: { security: 150 },
  uniqueFirstSolved: 50, coverage: 0.1, overallAccuracy: 0.7, domains: [], weakDomains: [],
};

describe('범위 진척도 사용자 격리 (#330 AC-6)', () => {
  it('사용자가 바뀌면 이전 사용자의 진척도를 표시하지 않는다', async () => {
    let resolveNext: ((value: StudyStats) => void) | undefined;
    const client = {
      get: vi.fn(() => ({
        json: async () => new Promise<StudyStats>((resolve) => { resolveNext = resolve; }),
      })),
    } as unknown as ApiClient;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(studyStatsQueryKey('saa-c03', 'user-a'), stats);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const props = { client, examId: 'saa-c03', scope: 'all' as const, domainId: 'security' };
    const view = render(<ScopeProgressView {...props} userId="user-a" />, { wrapper });
    expect(await screen.findByText('학습 진도 50 / 500문제 · 10%')).toBeInTheDocument();

    view.rerender(<ScopeProgressView {...props} userId="user-b" />);
    expect(await screen.findByRole('status')).toHaveTextContent('학습 진척도를 불러오고 있습니다');
    expect(screen.queryByText('학습 진도 50 / 500문제 · 10%')).not.toBeInTheDocument();

    await act(async () => {
      resolveNext?.({ ...stats, uniqueFirstSolved: 12 });
    });
    await waitFor(() => expect(screen.getByText('학습 진도 12 / 500문제 · 2.4%')).toBeInTheDocument());
  });
});
