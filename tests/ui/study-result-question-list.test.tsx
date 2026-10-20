import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudySubmittedSet } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { ResultView } from '../../src/ui/study/ResultView';

// #132 결과 화면 — 요약 아래 문항 목록에서 문항을 골라 기존 페이저 상세로 이동한다.

function fakeClient(): ApiClient {
  return {
    get: vi.fn(() => ({
      json: async () => ({ examId: 'saa-c03', total: 0, items: [] }),
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

// 4문항 — 정답·오답·Pass·미응답을 모두 포함한다.
function submittedSet(): StudySubmittedSet {
  const items = [0, 1, 2, 3].map((i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`],
    stem: `문제 ${i} 본문`,
    options: [
      { optionId: `q-${i}-a`, text: '보기 A' },
      { optionId: `q-${i}-b`, text: '보기 B' },
    ],
    response:
      i === 2
        ? { kind: 'pass' as const }
        : i === 3
          ? { kind: 'unanswered' as const }
          : { kind: 'answered' as const, optionIds: [i === 0 ? `q-${i}-a` : `q-${i}-b`] },
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
      accuracyPercent: 25,
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
          responseKind: 'answered',
          selectedOptionIds: ['q-1-b'],
          correctOptionIds: ['q-1-a'],
          correct: false,
        },
        {
          questionId: 'q-2',
          responseKind: 'pass',
          selectedOptionIds: [],
          correctOptionIds: ['q-2-a'],
          correct: false,
        },
        {
          questionId: 'q-3',
          responseKind: 'unanswered',
          selectedOptionIds: [],
          correctOptionIds: ['q-3-a'],
          correct: false,
        },
      ],
    },
  } as StudySubmittedSet;
}

function renderResult() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResultView client={fakeClient()} set={submittedSet()} onRestart={vi.fn()} onHistory={vi.fn()} />
    </QueryClientProvider>,
  );
}

function pager() {
  return screen.getByRole('group', { name: copy.study.resultPagerLabel });
}

function position(): string {
  const el = within(pager()).getByText(/^\d+\/\d+$/);
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('');
}

function listButton(name: string) {
  return screen.getByRole('button', { name });
}

describe('결과 문항 목록 (#132)', () => {
  it('요약 다음, 해설 앞에 번호·상태를 문구와 기호로 보여준다', () => {
    renderResult();
    const list = screen.getByRole('navigation', { name: '문항 목록' });
    expect(within(list).getByRole('list')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);

    expect(screen.getByText(/정답률 25%/).compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.compareDocumentPosition(pager()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    for (const [name, symbol] of [
      ['문제 1: 정답', '✓'],
      ['문제 2: 오답', '✕'],
      ['문제 3: Pass', '»'],
      ['문제 4: 미응답', '—'],
    ]) {
      const button = listButton(name);
      expect(button).toHaveTextContent(symbol);
    }
  });

  it('목록에서 문항을 선택하면 같은 화면의 페이저 상세가 해당 문항으로 이동한다', () => {
    renderResult();
    expect(position()).toBe('1/4');

    fireEvent.click(listButton('문제 3: Pass'));
    expect(position()).toBe('3/4');
    expect(screen.getByTestId('peritem-q-2')).toHaveTextContent('문제 2 해설');
    expect(listButton('문제 3: Pass')).toHaveAttribute('aria-current', 'step');
    expect(listButton('문제 1: 정답')).not.toHaveAttribute('aria-current');
    expect(pager()).toBeInTheDocument();
  });

  it('페이저로 이동해도 목록의 현재 문항 표시가 함께 바뀐다', () => {
    renderResult();
    fireEvent.click(screen.getByRole('button', { name: copy.study.nextItem }));
    expect(position()).toBe('2/4');
    expect(listButton('문제 2: 오답')).toHaveAttribute('aria-current', 'step');
    expect(listButton('문제 1: 정답')).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('button', { name: copy.study.prevItem }));
    expect(position()).toBe('1/4');
    expect(listButton('문제 1: 정답')).toHaveAttribute('aria-current', 'step');
  });

  it('방향키·Home·End로 문항을 이동하고 포커스도 함께 옮긴다', () => {
    renderResult();
    const first = listButton('문제 1: 정답');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(position()).toBe('2/4');
    expect(listButton('문제 2: 오답')).toHaveFocus();
    expect(listButton('문제 2: 오답')).toHaveAttribute('aria-current', 'step');

    fireEvent.keyDown(listButton('문제 2: 오답'), { key: 'ArrowDown' });
    expect(position()).toBe('3/4');
    expect(listButton('문제 3: Pass')).toHaveFocus();

    fireEvent.keyDown(listButton('문제 3: Pass'), { key: 'End' });
    expect(position()).toBe('4/4');
    expect(listButton('문제 4: 미응답')).toHaveFocus();

    fireEvent.keyDown(listButton('문제 4: 미응답'), { key: 'Home' });
    expect(position()).toBe('1/4');
    expect(first).toHaveFocus();
  });
});
