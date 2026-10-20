import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    items: base.items.map((it, i) => ({ ...it, explanation: `해설 ${i}`, sourceUrls: [] })),
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
      <StudyScreen client={client} userId="user-1" />
    </QueryClientProvider>,
  );
}

function tokens(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

// 같은 의미의 버튼은 높이·패딩·폰트가 같아야 한다 (DESIGN.md 5절).
const SIZE_TOKENS = ['h-11', 'min-h-[44px]', 'px-4', 'text-sm'];

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

    // 같은 의미의 버튼은 동일 크기(터치 타깃 44px)·동일 패딩·폰트.
    for (const el of [submit, pass, clear, prev, next, abandon]) {
      for (const t of SIZE_TOKENS) expect(tokens(el)).toContain(t);
    }
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
