// #233 Slice B — 셸 nav·학습 시작/풀이/결과 아이콘 적용 검증 (ADR-0073·DESIGN §4).
// 아이콘 존재·장식 aria-hidden·아이콘 단독 44px·접근 이름·상태 텍스트 유지를 본다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveItem, StudySubmittedSet } from '../../src/ui/api/client';
import { AppShell } from '../../src/ui/AppShell';
import { copy } from '../../src/ui/copy';
import { MOBILE_NAV_QUERY } from '../../src/ui/responsive';
import { QuestionView } from '../../src/ui/study/QuestionView';
import { ResultQuestionList } from '../../src/ui/study/ResultQuestionList';
import { ResultView } from '../../src/ui/study/ResultView';
import { StartView } from '../../src/ui/study/StartView';

function fakeClient(): ApiClient {
  return {
    get: vi.fn(() => ({
      json: async () => ({ items: [] }),
    })),
    post: vi.fn(async () => new Response(null, { status: 204 })),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 해당 버튼 안의 장식 아이콘 svg — aria-hidden + 포커스 제외. */
function decoIcon(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg[aria-hidden="true"]');
  expect(svg).not.toBeNull();
  expect(svg?.getAttribute('focusable')).toBe('false');
  return svg as SVGSVGElement;
}

/** 모바일(≤767px) 구간 matchMedia 오버라이드 — 케이스별로만 적용한다. */
function useViewport(mobile: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === MOBILE_NAV_QUERY ? mobile : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AppShell nav 아이콘', () => {
  function renderShell(mobile: boolean) {
    useViewport(mobile);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>본문</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('데스크톱 nav 4개 링크가 아이콘+라벨을 갖고 접근 이름이 유지된다', () => {
    renderShell(false);
    const nav = screen.getByRole('navigation', { name: copy.nav.label });
    for (const name of [copy.nav.study, copy.nav.history, copy.nav.review, copy.nav.account]) {
      const link = within(nav).getByRole('link', { name: name });
      const svg = decoIcon(link);
      expect(svg.getAttribute('width')).toBe('20');
    }
  });

  it('모바일 트리거·닫기 버튼이 spec 아이콘(24px)을 갖고 라벨이 유지된다', () => {
    renderShell(true);
    const trigger = screen.getByRole('button', { name: copy.nav.menuOpen });
    expect(decoIcon(trigger).getAttribute('width')).toBe('24');
    fireEvent.click(trigger);
    const close = screen.getByRole('button', { name: copy.nav.menuClose });
    expect(decoIcon(close).getAttribute('width')).toBe('24');
    // Drawer nav 링크에도 아이콘이 있다.
    const drawerNav = screen.getAllByRole('navigation', { name: copy.nav.label })[0];
    expect(within(drawerNav).getAllByRole('link')).toHaveLength(4);
  });
});

describe('StartView 아이콘', () => {
  const base = {
    scope: 'all' as const,
    domainId: 'dom-security',
    pending: false,
    conflict: false,
    unauthorized: false,
    startError: null,
    onScope: vi.fn(),
    onDomain: vi.fn(),
    onStart: vi.fn(),
    onResume: vi.fn(),
  };

  it('학습 시작 버튼이 Play 아이콘+라벨을 갖는다', () => {
    renderWithProviders(<StartView {...base} />);
    const button = screen.getByRole('button', { name: copy.study.startAction });
    expect(decoIcon(button).getAttribute('width')).toBe('20');
  });

  it('이어풀기·학습 이력 버튼이 아이콘+라벨을 갖는다', () => {
    renderWithProviders(<StartView {...base} conflict onHistory={vi.fn()} />);
    expect(decoIcon(screen.getByRole('button', { name: copy.study.continueStudy }))).not.toBeNull();
    expect(decoIcon(screen.getByRole('button', { name: copy.study.historyLink }))).not.toBeNull();
  });
});

function activeItems(): StudyActiveItem[] {
  return [0, 1].map((i) => ({
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
    response: { kind: 'unanswered' as const },
  }));
}

describe('QuestionView 아이콘', () => {
  it('제출·이전/다음·Pass·포기 버튼이 아이콘+라벨을 갖는다', () => {
    renderWithProviders(
      <QuestionView
        client={fakeClient()}
        items={activeItems()}
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
    expect(decoIcon(screen.getByRole('button', { name: /제출하기/ }))).not.toBeNull();
    expect(decoIcon(screen.getByRole('button', { name: copy.study.prev }))).not.toBeNull();
    expect(decoIcon(screen.getByRole('button', { name: copy.study.next }))).not.toBeNull();
    expect(decoIcon(screen.getByRole('button', { name: copy.study.pass }))).not.toBeNull();
    expect(decoIcon(screen.getByRole('button', { name: copy.study.abandon }))).not.toBeNull();
    // 액션 아이콘은 20px 토큰이다.
    expect(
      decoIcon(screen.getByRole('button', { name: copy.study.pass })).getAttribute('width'),
    ).toBe('20');
  });
});

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
        ? ({ kind: 'pass' as const })
        : i === 3
          ? ({ kind: 'unanswered' as const })
          : ({ kind: 'answered' as const, optionIds: [i === 0 ? `q-${i}-a` : `q-${i}-b`] }),
    answerOptionIds: [`q-${i}-a`],
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

describe('ResultView·ResultPager 아이콘', () => {
  it('새 세트·학습 이력·복습 바로가기 버튼이 아이콘+라벨을 갖는다', () => {
    renderWithProviders(
      <ResultView client={fakeClient()} set={submittedSet()} onRestart={vi.fn()} onHistory={vi.fn()} />,
    );
    expect(decoIcon(screen.getByRole('button', { name: copy.study.backToStart }))).not.toBeNull();
    expect(decoIcon(screen.getByRole('button', { name: copy.study.historyLink }))).not.toBeNull();
    expect(
      decoIcon(screen.getByRole('link', { name: copy.review.goToWrongReview })),
    ).not.toBeNull();
    expect(
      decoIcon(screen.getByRole('link', { name: copy.review.goToBookmarkReview })),
    ).not.toBeNull();
  });

  it('페이저 이전/다음·결과 요약 버튼이 아이콘+라벨을 갖는다', () => {
    renderWithProviders(
      <ResultView client={fakeClient()} set={submittedSet()} onRestart={vi.fn()} onHistory={vi.fn()} />,
    );
    expect(decoIcon(screen.getByRole('button', { name: copy.study.prevItem }))).not.toBeNull();
    expect(decoIcon(screen.getByRole('button', { name: copy.study.nextItem }))).not.toBeNull();
  });
});

describe('ResultQuestionList 상태 아이콘', () => {
  it('✓✕»— 기호 대신 spec 아이콘을 쓰고 상태 텍스트·aria를 유지한다', () => {
    const set = submittedSet();
    renderWithProviders(
      <ResultQuestionList perItem={set.result.perItem} currentIndex={0} onSelect={vi.fn()} />,
    );
    const labels = [
      `${copy.study.questionLabel} 1: ${copy.study.resultStatusCorrect}`,
      `${copy.study.questionLabel} 2: ${copy.study.resultStatusIncorrect}`,
      `${copy.study.questionLabel} 3: ${copy.study.pass}`,
      `${copy.study.questionLabel} 4: ${copy.study.unansweredLabel}`,
    ];
    for (const name of labels) {
      const button = screen.getByRole('button', { name });
      expect(decoIcon(button)).not.toBeNull();
      // 상태 텍스트 라벨이 그대로 노출된다(색만으로 전달 금지).
      expect(button).toHaveTextContent(
        name.split(': ')[1] as string,
      );
    }
    // 구 기호 텍스트가 DOM에 남아 있지 않다.
    const symbols = screen.getByRole('navigation');
    expect(symbols.textContent).not.toContain('✓');
    expect(symbols.textContent).not.toContain('✕');
    expect(symbols.textContent).not.toContain('»');
  });
});
