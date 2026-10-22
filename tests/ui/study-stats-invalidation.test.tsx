import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudySubmittedSet } from '../../src/ui/api/client';
import { useSubmitStudy } from '../../src/ui/study/queries';
import { studyStatsQueryKey } from '../../src/ui/stats/useStudyStats';

describe('제출 후 학습 진척도 재조회 (#330 AC-6)', () => {
  it('해당 사용자·시험의 stats 캐시를 무효화한다', async () => {
    const submitted = {
      id: 'set-1', userId: 'user-a', examId: 'saa-c03', mode: 'all', status: 'submitted',
      createdAt: 1, submittedAt: 2, items: [],
      result: { answeredCount: 0, correctCount: 0, accuracyPercent: 0, passCount: 0, unansweredCount: 0, perItem: [] },
    } as unknown as StudySubmittedSet;
    const client = {
      post: vi.fn(() => ({ json: async () => submitted })),
    } as unknown as ApiClient;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSubmitStudy(client, { examId: 'saa-c03', userId: 'user-a' }), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ setId: 'set-1', confirmUnanswered: true });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: studyStatsQueryKey('saa-c03', 'user-a') });
    });
  });
});
