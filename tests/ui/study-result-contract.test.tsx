import { readFileSync } from 'node:fs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudySubmittedSet } from '../../src/ui/api/client';
import { isSubmittedSet } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
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

function threeItemSet(): StudySubmittedSet {
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
    answerOptionIds: [`q-${i}-a`],
    response: { kind: 'answered' as const, optionIds: [`q-${i}-a`] },
    explanation: `문제 ${i} 해설`,
    sourceUrls: [`https://docs.aws.amazon.com/q-${i}`],
  }));
  return {
    id: 'set-3',
    userId: 'u-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'submitted',
    createdAt: 1700000000000,
    submittedAt: 1700000001000,
    items,
    result: {
      answeredCount: 3,
      correctCount: 3,
      accuracyPercent: 100,
      passCount: 0,
      unansweredCount: 0,
      perItem: items.map((it) => ({
        questionId: it.questionId,
        responseKind: 'answered',
        selectedOptionIds: [it.optionOrder[0]],
        correctOptionIds: [it.optionOrder[0]],
        correct: true,
      })),
    },
  } as StudySubmittedSet;
}

function renderResult(set: StudySubmittedSet, client?: ApiClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/study/result']}>
        <ResultView
          client={client ?? fakeClient()}
          set={set}
          onRestart={() => {}}
          onHistory={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('결과 CTA·마지막 문항 동선 (#232)', () => {
  it('마지막 상세는 [이전][결과 요약으로]·다음 없음·재제출 없음', () => {
    renderResult(threeItemSet());
    const pager = () => screen.getByRole('group', { name: copy.study.resultPagerLabel });
    // 1/3에서는 다음이 있다.
    expect(screen.getByRole('button', { name: copy.study.nextItem })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.study.nextItem }));
    fireEvent.click(screen.getByRole('button', { name: copy.study.nextItem }));
    expect(within(pager()).getByText('3/3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.study.nextItem })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.study.backToSummary })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.study.prevItem })).toBeEnabled();
    // 재제출 버튼 없음 — 제출 문구 버튼이 결과 화면에 없다.
    expect(screen.queryByRole('button', { name: /제출하기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제출 확인' })).not.toBeInTheDocument();
  });

  it('결과 요약으로 클릭 시 요약 h1로 포커스 이동·API 호출 없음', () => {
    const client = fakeClient();
    renderResult(threeItemSet(), client);
    fireEvent.click(screen.getByRole('button', { name: copy.study.nextItem }));
    fireEvent.click(screen.getByRole('button', { name: copy.study.nextItem }));
    const summaryBtn = screen.getByRole('button', { name: copy.study.backToSummary });
    // 44px 터치 타깃 (DESIGN.md 5절·ADR-0050).
    for (const t of ['h-11', 'min-h-[44px]']) {
      expect((summaryBtn.getAttribute('class') ?? '').split(/\s+/)).toContain(t);
    }
    fireEvent.click(summaryBtn);
    const h1 = screen.getByRole('heading', { name: copy.study.resultTitle });
    expect(h1).toHaveAttribute('id', 'moi-study-result-summary');
    expect(document.activeElement).toBe(h1);
    expect(client.post).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
  });

  it('버튼형 링크는 밑줄 없음·근거 링크는 밑줄 유지', () => {
    renderResult(threeItemSet());
    const css = readFileSync('src/ui/authenticated.css', 'utf8');
    expect(css).toMatch(/\[data-slot='button'\][\s\S]*text-decoration:\s*none/);
    expect(css).not.toMatch(/^\s*a\s*\{\s*text-decoration:\s*none/m);
    const wrong = screen.getByRole('link', { name: /오답 복습/ });
    expect(wrong).toHaveAttribute('data-slot', 'button');
    // 실제 브라우저 계산 스타일 대신: 규칙 주입 후 computed가 none임을 확인한다.
    const style = document.createElement('style');
    style.textContent = `[data-slot='button'] { text-decoration: none; }`;
    document.head.appendChild(style);
    expect(getComputedStyle(wrong).textDecorationLine).toBe('none');
    style.remove();
    // 근거 링크는 버튼이 아니며 밑줄 규칙을 유지한다.
    const sourceCss = readFileSync('src/ui/source-links.css', 'utf8');
    expect(sourceCss).toMatch(/\.moi-source-links a[\s\S]*text-decoration:\s*underline/);
    const card = screen.getByTestId('peritem-q-0');
    const source = within(card).getByRole('link', { name: 'Q 0' });
    expect(source).not.toHaveAttribute('data-slot');
  });
});

describe('결과 문항 정보·액션 그룹 구조 (#232 후속)', () => {
  it('정보 dl과 액션 그룹이 별도 컨테이너로 분리된다', () => {
    renderResult(threeItemSet());
    const card = screen.getByTestId('peritem-q-0');
    const info = card.querySelector('.moi-study-meta') as HTMLElement;
    expect(info).not.toBeNull();
    expect(info).toHaveAttribute('aria-label', copy.study.itemInfo);
    const actions = within(card).getByRole('group', { name: copy.study.itemActions });
    // 같은 li 안의 서로 다른 컨테이너 — 상태 문구가 액션과 같은 줄에 끼지 않는다.
    expect(info).not.toBe(actions as unknown as HTMLElement);
    expect(info.closest('li')).toBe(actions.closest('li'));
    expect(info.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const label of ['문항', '채점', '응답', '선택', '정답']) {
      expect(within(info).getByText(label, { selector: 'dt' })).toBeInTheDocument();
    }
    // 탐색 그룹은 액션 그룹과 분리된다.
    const pager = screen.getByRole('group', { name: copy.study.resultPagerLabel });
    const nav = pager.querySelector('.moi-study-pager-nav') as HTMLElement;
    expect(nav).not.toBeNull();
    expect(nav.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('북마크·신고 버튼이 44px·키보드 접근·상태 구분을 갖는다', async () => {
    renderResult(threeItemSet());
    const card = screen.getByTestId('peritem-q-0');
    const actions = within(card).getByRole('group', { name: copy.study.itemActions });
    const bookmark = within(actions).getByRole('button', { name: /북마크/ });
    const report = within(actions).getByRole('button', { name: '문제 신고' });
    // 북마크 쿼리 settled 후 enabled — 로딩 중 disabled는 DESIGN.md 7절 계약이다.
    // 북마크: 44px 토큰·pressed 상태·접근 이름 유지(색만으로 구분 금지).
    for (const t of ['min-h-[44px]', 'min-w-[44px]']) {
      expect((bookmark.getAttribute('class') ?? '').split(/\s+/)).toContain(t);
    }
    expect(bookmark).toHaveAttribute('aria-pressed');
    // 신고: 44px 터치·hover/active/disabled·focus-visible 규칙(CSS 계약).
    const css = readFileSync('src/ui/study/study-feedback.css', 'utf8');
    expect(css).toMatch(/\.moi-report-open[\s\S]*min-height:\s*var\(--moi-touch-min\)/);
    expect(css).toMatch(/\.moi-report-open:hover/);
    expect(css).toMatch(/\.moi-report-open:active/);
    expect(css).toMatch(/\.moi-report-open:disabled/);
    expect(css).toMatch(/\.moi-study-item-actions[\s\S]*gap:\s*var\(--moi-space-2\)/);
    // 키보드: 두 버튼 모두 포커스 가능하고 신고는 dialog를 연다.
    await waitFor(() => expect(bookmark).toBeEnabled());
    bookmark.focus();
    expect(document.activeElement).toBe(bookmark);
    report.focus();
    expect(document.activeElement).toBe(report);
    fireEvent.click(report);
    expect(screen.getByRole('dialog', { name: copy.report.title })).toBeInTheDocument();
  });
});
