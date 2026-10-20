import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyCorrections, StudySubmittedSet } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { ResultView } from '../../src/ui/study/ResultView';

// #189 결과 화면 — 해설을 한 문항씩 좌우 페이징으로 보여준다.

function fakeClient(): ApiClient {
  return {
    get: vi.fn(() => ({
      json: async () => ({ examId: 'saa-c03', total: 0, items: [] }),
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

// 3문항 제출 세트 — q-0 정답, q-1 Pass, q-2 미응답. 각 문항마다 해설·근거가 있다.
function submittedSet(): StudySubmittedSet {
  const items = [0, 1, 2].map((i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`],
    stem: `문제 ${i} 본문`,
    options: [
      { optionId: `q-${i}-a`, text: '보기 A' },
      { optionId: `q-${i}-b`, text: '보기 B' },
    ],
    response: { kind: 'answered' as const, optionIds: [`q-${i}-a`] },
    explanation: `문제 ${i} 해설`,
    sourceUrls: [`https://docs.aws.amazon.com/q-${i}`],
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
      accuracyPercent: 33,
      passCount: 1,
      unansweredCount: 1,
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
          responseKind: 'pass',
          selectedOptionIds: [],
          correctOptionIds: ['q-1-a'],
          correct: false,
        },
        {
          questionId: 'q-2',
          responseKind: 'unanswered',
          selectedOptionIds: [],
          correctOptionIds: ['q-2-a'],
          correct: false,
        },
      ],
    },
  } as StudySubmittedSet;
}

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
      answeredCount: 2,
      correctCount: 1,
      accuracyPercent: 50,
      passCount: 1,
      unansweredCount: 1,
      ungraded: false,
      validTotal: 2,
      excludedCount: 1,
      excludedQuestionVersionIds: ['qv-1'],
      perItem: [],
    },
  };
}

function renderResult(corrections?: StudyCorrections) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResultView
        client={fakeClient()}
        set={submittedSet()}
        onRestart={vi.fn()}
        onHistory={vi.fn()}
        corrections={corrections}
      />
    </QueryClientProvider>,
  );
}

// 페이저 영역 — 요약의 "정답 1/3"과 구분하기 위해 진행 표시는 이 안에서 찾는다.
function pager() {
  return screen.getByRole('group', { name: copy.study.resultPagerLabel });
}

// 진행 표시의 직접 텍스트만 읽는다 — 화면 전용 문구(sr-only)는 제외한다.
function position(): string {
  const el = within(pager()).getByText(/^\d+\/\d+$/);
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('');
}

function perItemIds(): string[] {
  return Array.from(document.querySelectorAll('[data-testid^="peritem-"]')).map(
    (el) => el.getAttribute('data-testid') ?? '',
  );
}

describe('결과 해설 좌우 페이징 (#189)', () => {
  it('문항 카드는 1개만 보여주고 진행 표시로 1/N을 안내한다', () => {
    renderResult();
    expect(position()).toBe('1/3');
    expect(perItemIds()).toEqual(['peritem-q-0']);
    // 요약은 상단에 그대로 둔다.
    expect(screen.getByText(/정답률 33%/)).toBeInTheDocument();
    expect(screen.getByText('정답')).toBeInTheDocument();
  });

  it('다음·이전 버튼으로 문항을 넘기면 해설·근거 링크가 함께 바뀐다', () => {
    renderResult();
    fireEvent.click(screen.getByRole('button', { name: copy.study.nextItem }));
    expect(position()).toBe('2/3');
    expect(perItemIds()).toEqual(['peritem-q-1']);
    const card = screen.getByTestId('peritem-q-1');
    expect(within(card).getByText('문제 1 해설')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Q 1' })).toHaveAttribute(
      'href',
      'https://docs.aws.amazon.com/q-1',
    );

    fireEvent.click(screen.getByRole('button', { name: copy.study.prevItem }));
    expect(position()).toBe('1/3');
    expect(perItemIds()).toEqual(['peritem-q-0']);
    expect(within(screen.getByTestId('peritem-q-0')).getByRole('link', { name: 'Q 0' })).toBeInTheDocument();
  });

  it('첫 문항에서 이전, 마지막 문항에서 다음 버튼이 disabled다', () => {
    renderResult();
    expect(screen.getByRole('button', { name: copy.study.prevItem })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.study.nextItem })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: copy.study.nextItem }));
    fireEvent.click(screen.getByRole('button', { name: copy.study.nextItem }));
    expect(position()).toBe('3/3');
    expect(screen.getByRole('button', { name: copy.study.nextItem })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.study.prevItem })).toBeEnabled();
  });

  it('키보드 방향키로 문항을 넘긴다 — 포커스가 결과 영역에 있을 때만', () => {
    renderResult();
    const next = screen.getByRole('button', { name: copy.study.nextItem });
    next.focus();
    fireEvent.keyDown(next, { key: 'ArrowRight' });
    expect(position()).toBe('2/3');

    const prev = screen.getByRole('button', { name: copy.study.prevItem });
    prev.focus();
    fireEvent.keyDown(prev, { key: 'ArrowLeft' });
    expect(position()).toBe('1/3');
  });

  it('진행 표시는 aria-live로 변경을 알린다', () => {
    renderResult();
    expect(within(pager()).getByText(/^\d+\/\d+$/)).toHaveAttribute('aria-live', 'polite');
  });

  it('정정 반영은 페이저 아래 기존 위치에 둔다', () => {
    renderResult(correctionsFixture());
    const detail = screen.getByRole('region', { name: copy.study.correctionTitle });
    // DOM 순서상 페이저가 정정 섹션보다 앞선다.
    expect(pager().compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(copy.study.correctionTitle)).toBeInTheDocument();
  });
});
