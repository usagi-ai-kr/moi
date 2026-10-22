import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/ui/api/client';
import type { ConceptDetailResponse, ConceptRecommendationsResponse } from '@/ui/api/concept-client';
import { ExamScopeContext, type ExamScopeValue } from '@/ui/exam/ExamScopeProvider';
import { EXAM_CATALOG } from '@/ui/exam/exam-catalog';
import { ConceptWikiScreen } from '@/ui/concepts/ConceptWikiScreen';

const scope: ExamScopeValue = {
  code: 'saa-c03',
  examId: 'saa-c03',
  label: 'AWS SAA-C03',
  exams: EXAM_CATALOG,
  setExam: () => {},
};

const recommendations: ConceptRecommendationsResponse = {
  examId: 'saa-c03',
  total: 1,
  reviewedContentAvailable: true,
  items: [{ conceptId: 'iam-identity-access', title: 'IAM 자격 증명과 최소 권한', relatedQuestionCount: 1, reason: '오답 1문항 · 북마크 1문항' }],
};

const detail: ConceptDetailResponse = {
  conceptId: 'iam-identity-access',
  title: 'IAM 자격 증명과 최소 권한',
  summary: '임시 자격 증명과 최소 권한을 학습합니다.',
  confusions: [{ term: '신뢰 정책', with: '권한 정책', difference: '수임 주체와 허용 작업을 각각 정합니다.' }],
  sourceUrls: ['https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html'],
  relatedQuestions: [{ stem: '문제 본문이 연결됩니다.', hasWrongHistory: true, bookmarked: true }],
};

function renderScreen(response = recommendations) {
  const requested: string[] = [];
  const client = {
    get: (path: string) => {
      requested.push(path);
      return {
        json: async () => path.includes('/recommendations') ? response : detail,
      };
    },
  } as unknown as ApiClient;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ExamScopeContext.Provider value={scope}>
          <ConceptWikiScreen client={client} userId="user-a" />
        </ExamScopeContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { requested, queryClient };
}

describe('개념 위키 UI (#329)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('목차에는 이유·문제 수만 표시하고 선택한 개념에서만 본문을 지연 조회한다', async () => {
    const { requested } = renderScreen();
    const concept = await screen.findByRole('button', { name: /IAM 자격 증명과 최소 권한/ });

    expect(concept).toHaveTextContent('오답 1문항 · 북마크 1문항');
    expect(concept).toHaveTextContent('관련 문제 1개');
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain('/recommendations');

    fireEvent.click(concept);
    expect(await screen.findByText('임시 자격 증명과 최소 권한을 학습합니다.')).toBeInTheDocument();
    expect(screen.getByText('수임 주체와 허용 작업을 각각 정합니다.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /공식 근거/ })).toHaveAttribute('href', detail.sourceUrls[0]);
    await waitFor(() => expect(requested).toHaveLength(2));
    expect(requested[1]).toContain('api/concepts/iam-identity-access?');
  });

  it('관련 문제에서는 UUID를 노출하지 않고 오답·북마크 복습 경로를 제공한다', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /IAM 자격 증명과 최소 권한/ }));

    expect(await screen.findByText('문제 본문이 연결됩니다.')).toBeInTheDocument();
    expect(screen.getByText('오답 이력')).toBeInTheDocument();
    expect(screen.getByText('북마크')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '연결된 오답 복습 열기' })).toHaveAttribute('href', '/review?mode=wrong');
    expect(screen.getByRole('link', { name: '연결된 북마크 복습 열기' })).toHaveAttribute('href', '/review?mode=bookmark');
    expect(document.body.textContent).not.toContain('user-a');
  });

  it('근거가 없으면 추천 목록 대신 검수 콘텐츠가 준비되지 않은 빈 상태를 보여준다', async () => {
    renderScreen({ examId: 'saa-c03', total: 0, reviewedContentAvailable: false, items: [] });

    expect(await screen.findByRole('heading', { name: '아직 추천할 개념이 없습니다' })).toBeInTheDocument();
    expect(screen.getByText('이 시험은 아직 검수된 개념 문서가 없어 추천을 표시하지 않습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '추천 개념 목차' })).not.toBeInTheDocument();
  });
});
