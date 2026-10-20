import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HTTPError } from 'ky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveSet } from '../../src/ui/api/client';
import { StudyScreen } from '../../src/ui/study/StudyScreen';
import { useStudyUiStore } from '../../src/ui/study/store';

// 풀이·결과 화면 버튼 위계 — shadcn Button variant·동일 크기(44px 터치 타깃) 계약 (#148).

function makeSet(): StudyActiveSet {
  const items = Array.from({ length: 3 }, (_, i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`],
    stem: `문제 ${i} 본문`,
    options: [
      { optionId: `q-${i}-a`, text: `보기 ${i}-a` },
      { optionId: `q-${i}-b`, text: `보기 ${i}-b` },
    ],
    answerCount: 1,
    response: { kind: 'unanswered' as const },
  }));
  return {
    id: 'set-1',
    userId: 'u-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'active',
    createdAt: 1700000000000,
    items,
  } as StudyActiveSet;
}

function submittedSet(): StudyActiveSet {
  const base = makeSet();
  return {
    ...base,
    status: 'submitted',
    submittedAt: 1700000001000,
    items: base.items.map((it, i) => ({ ...it, answerOptionIds: [`${it.questionId}-a`], explanation: `해설 ${i}`, sourceUrls: [] })),
    result: {
      answeredCount: 1,
      correctCount: 1,
      accuracyPercent: 33,
      passCount: 0,
      unansweredCount: 2,
      perItem: base.items.map((it, i) => ({
        questionId: it.questionId,
        responseKind: i === 0 ? 'answered' : 'unanswered',
        selectedOptionIds: i === 0 ? [`${it.questionId}-a`] : [],
        correctOptionIds: [`${it.questionId}-a`],
        correct: i === 0,
      })),
    },
  } as StudyActiveSet;
}

function httpError(status: number, body: unknown, url = 'http://localhost/api/study/sets'): HTTPError {
  return new HTTPError(new Response(JSON.stringify(body), { status }), new Request(url), {} as never);
}

function fakeStudyClient(): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).includes('api/review/bookmarks')) return { examId: 'saa-c03', total: 0, items: [] };
        throw httpError(404, { error: 'not_found' });
      },
    })),
    post: vi.fn((path: string) => ({
      json: async () => {
        if (String(path) === 'api/study/sets') return makeSet();
        if (String(path).endsWith('/submit')) return submittedSet();
        throw httpError(404, { error: 'not_found' });
      },
    })),
    patch: vi.fn(() => ({ json: async () => ({ outcome: 'answered' }) })),
  } as unknown as ApiClient;
}

function renderStudy(client: ApiClient) {
  useStudyUiStore.setState({
    view: 'start',
    scope: 'all',
    domainId: 'dom-security',
    index: 0,
    save: 'idle',
    confirmSubmit: false,
    confirmAbandon: false,
    historyPage: 1,
    detailId: null,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StudyScreen client={client} userId="user-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function tokens(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

// 같은 의미의 버튼은 높이·폰트가 같아야 한다 (DESIGN.md 5절).
const SIZE_TOKENS = ['h-11', 'min-h-[44px]', 'text-sm'];
// 풀이·탐색 버튼은 기본 패딩, 상단 제출·포기는 320px 한 줄 배치를 위한 컴팩트 패딩 (#186).
const DEFAULT_PADDING = 'px-4';
const TOP_ACTION_PADDING = 'px-3';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  useStudyUiStore.setState({
    view: 'start',
    scope: 'all',
    domainId: 'dom-security',
    index: 0,
    save: 'idle',
    confirmSubmit: false,
    confirmAbandon: false,
    historyPage: 1,
    detailId: null,
  });
});

describe('학습 화면 버튼 위계', () => {
  it('풀이 화면: 제출=primary·이전/다음/Pass=secondary·지우기=ghost·포기=destructive', async () => {
    renderStudy(fakeStudyClient());
    fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/3/);

    const submit = screen.getByRole('button', { name: /제출하기/ });
    const pass = screen.getByRole('button', { name: 'Pass' });
    const clear = screen.getByRole('button', { name: '미응답으로 지우기' });
    const prev = screen.getByRole('button', { name: '이전' });
    const next = screen.getByRole('button', { name: '다음' });
    const abandon = screen.getByRole('button', { name: '포기하기' });

    expect(tokens(submit)).toContain('bg-primary');
    for (const el of [pass, prev, next]) expect(tokens(el)).toContain('bg-muted');
    expect(tokens(clear)).not.toContain('bg-muted');
    expect(tokens(clear)).not.toContain('bg-primary');
    expect(tokens(abandon)).toContain('text-destructive');
    expect(tokens(abandon)).toContain('border');

    // 같은 의미의 버튼은 동일 크기(터치 타깃 44px)·동일 폰트.
    for (const el of [submit, pass, clear, prev, next, abandon]) {
      for (const t of SIZE_TOKENS) expect(tokens(el)).toContain(t);
    }
    // 풀이·탐색 버튼은 기본 패딩, 상단 제출·포기는 컴팩트 패딩(320px 한 줄 배치, #186).
    for (const el of [pass, clear, prev, next]) expect(tokens(el)).toContain(DEFAULT_PADDING);
    for (const el of [submit, abandon]) expect(tokens(el)).toContain(TOP_ACTION_PADDING);
  });

  it('풀이 화면: 이전/다음 disabled 상태가 유지된다', async () => {
    renderStudy(fakeStudyClient());
    fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/3/);

    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전' })).not.toBeDisabled();
  });

  it('Pass 클릭 시 즉시 다음 문제로 이동한다(#185)', async () => {
    renderStudy(fakeStudyClient());
    fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/3/);

    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));

    expect(await screen.findByText(/2\/3/)).toBeInTheDocument();
    expect(screen.getByText('문제 1 본문')).toBeInTheDocument();
  });

  it('마지막 문제에서 Pass → 화면을 유지하고 응답만 Pass로 남는다(#185)', async () => {
    renderStudy(fakeStudyClient());
    fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/3/);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText(/3\/3/);

    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));

    await waitFor(() => expect(screen.getByText(/3\/3 · Pass/)).toBeInTheDocument());
    expect(screen.getByText('문제 2 본문')).toBeInTheDocument();
  });

  it('제출·포기 버튼이 문제 본문보다 상단(진행 표시 직후)에 온다(#186)', async () => {
    renderStudy(fakeStudyClient());
    fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/3/);

    const progress = screen.getByText(/1\/3/);
    const submit = screen.getByRole('button', { name: /제출하기/ });
    const abandon = screen.getByRole('button', { name: '포기하기' });
    const stem = screen.getByText('문제 0 본문');
    const before = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    expect(before(progress, submit)).toBe(true); // 진행 표시 → 제출
    expect(before(submit, abandon)).toBe(true); // 제출 → 포기
    expect(before(abandon, stem)).toBe(true); // 포기 → 문제 본문
    expect(screen.getByRole('button', { name: /제출하기 \(3 미응답\)/ })).toBeInTheDocument();
  });

  it('상단 제출·포기 클릭 시 확인 대화상자 흐름이 유지된다(#186)', async () => {
    renderStudy(fakeStudyClient());
    fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/3/);

    fireEvent.click(screen.getByRole('button', { name: /제출하기/ }));
    expect(await screen.findByRole('alertdialog', { name: '제출 확인' })).toBeInTheDocument();
    expect(screen.getByText(/풀지 않은 문제가 있습니다/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('alertdialog', { name: '제출 확인' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '포기하기' }));
    expect(await screen.findByRole('alertdialog', { name: '정말 학습을 포기하시겠습니까?' })).toBeInTheDocument();
    expect(screen.getByText('포기한 세트는 채점되지 않습니다.')).toBeInTheDocument();
  });

  it('결과 화면: 새 세트 시작=primary·학습 이력·오답 복습=secondary(같은 크기)', async () => {
    renderStudy(fakeStudyClient());
    fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/3/);
    fireEvent.click(screen.getByLabelText(/보기 1/));
    await screen.findByText('저장됨');
    fireEvent.click(screen.getByRole('button', { name: /제출하기/ }));
    fireEvent.click(screen.getByRole('button', { name: '제출 확인' }));
    await waitFor(() => expect(screen.getByText('학습 결과')).toBeInTheDocument());

    const restart = screen.getByRole('button', { name: '새 세트 시작' });
    const history = screen.getByRole('button', { name: '학습 이력' });
    const wrong = screen.getByRole('link', { name: /오답 복습/ });

    expect(tokens(restart)).toContain('bg-primary');
    expect(tokens(history)).toContain('bg-muted');
    expect(tokens(wrong)).toContain('bg-muted');
    expect(wrong).toHaveAttribute('href', '/review?mode=wrong');
    for (const el of [restart, history, wrong]) {
      for (const t of SIZE_TOKENS) expect(tokens(el)).toContain(t);
    }
  });
});
