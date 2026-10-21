import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveItem } from '../../src/ui/api/client';
import type { ReviewPendingItem } from '../../src/ui/api/review-client';
import { copy } from '../../src/ui/copy';
import { ReviewQuestion } from '../../src/ui/review/ReviewQuestion';
import { QuestionView } from '../../src/ui/study/QuestionView';

function fakeClient(): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('정답 개수 안내 (#50)', () => {
  it('풀이 화면에 스냅샷 기준 정답 개수를 안내한다', () => {
    const item: StudyActiveItem = {
      questionId: 'q-1',
      questionVersionId: 'qv-1',
      versionNo: 1,
      optionOrder: ['opt-a', 'opt-b'],
      stem: '문제 본문',
      options: [
        { optionId: 'opt-a', text: '보기 A' },
        { optionId: 'opt-b', text: '보기 B' },
      ],
      answerCount: 1,
      response: { kind: 'unanswered' },
    };
    withQuery(
      <QuestionView
        client={fakeClient()}
        items={[item]}
        index={0}
        save="idle"
        submitting={false}
        unansweredCount={1}
        submitError={null}
        onIndex={vi.fn()}
        onAnswer={vi.fn()}
        onPass={vi.fn()}
        onClear={vi.fn()}
        onRetry={vi.fn()}
        onSubmitRequest={vi.fn()}
        onAbandonRequest={vi.fn()}
      />,
    );
    expect(screen.getByText(copy.study.answerCountHint(1))).toBeInTheDocument();
  });

  it('복습 화면에 정답 개수를 안내하고 고정 문구를 쓰지 않는다', () => {
    const item: ReviewPendingItem = {
      questionId: 'q-w1',
      stem: '복습 문제 본문',
      options: [
        { optionId: 'opt-a', text: '보기 A' },
        { optionId: 'opt-b', text: '보기 B' },
      ],
      answerCount: 2,
      response: null,
    };
    withQuery(
      <ReviewQuestion
        client={fakeClient()}
        examId="saa-c03"
        item={item}
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
    expect(screen.getByText(copy.review.answerCountHint(2))).toBeInTheDocument();
    expect(screen.queryByText('복수 선택이 가능합니다.')).not.toBeInTheDocument();
  });
});
