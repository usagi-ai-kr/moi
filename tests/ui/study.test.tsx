import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HTTPError } from 'ky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveSet } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { StudyScreen } from '../../src/ui/study/StudyScreen';
import { useStudyUiStore } from '../../src/ui/study/store';

function httpError(status: number, body: unknown, url = 'http://localhost/api/study/sets'): HTTPError {
  return new HTTPError(new Response(JSON.stringify(body), { status }), new Request(url), {} as never);
}

function makeSet(overrides?: Partial<StudyActiveSet>): StudyActiveSet {
  const items = Array.from({ length: 20 }, (_, i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`],
    stem: `문제 ${i} 본문: VPC와 서브넷 구성은?`,
    options: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`].map((id) => ({
      optionId: id,
      text: `보기 ${id} 내용`,
    })),
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
    ...overrides,
  };
}

function submittedSet(): StudyActiveSet {
  const base = makeSet({ status: 'submitted', submittedAt: 1700000001000 });
  return {
    ...base,
    items: base.items.map((it, i) => ({
      ...it,
      explanation: `문제 ${i} 해설: 정답은 ${it.questionId}-a이다.`,
      sourceUrls: [`https://docs.aws.amazon.com/q-${i}`],
    })),
    result: {
      answeredCount: 1,
      correctCount: 1,
      accuracyPercent: 5,
      passCount: 1,
      unansweredCount: 18,
      perItem: base.items.map((it, i) => ({
        questionId: it.questionId,
        responseKind: i === 0 ? 'answered' : i === 1 ? 'pass' : 'unanswered',
        selectedOptionIds: i === 0 ? [`${it.questionId}-a`] : [],
        correctOptionIds: [`${it.questionId}-a`],
        correct: i === 0,
      })),
    },
  } as StudyActiveSet;
}

interface FakeOpts {
  start?: StudyActiveSet | { status: number; body: unknown };
  get?: StudyActiveSet;
  patchFailTimes?: number;
  patchHttpFailTimes?: number;
  submit?: StudyActiveSet;
  abandon?: StudyActiveSet;
  calls?: { patch: unknown[]; post: string[] };
}

function fakeStudyClient(o: FakeOpts = {}): ApiClient {
  let patchCalls = 0;
  const calls = o.calls ?? { patch: [], post: [] };
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/sets/')) {
          if (o.get) return o.get;
          throw httpError(404, { error: 'not_found' });
        }
        if (String(path).includes('api/review/bookmarks')) {
          return { examId: 'saa-c03', total: 0, items: [] };
        }
        throw httpError(404, { error: 'not_found' });
      },
    })),
    post: vi.fn((path: string) => {
      calls.post.push(String(path));
      return {
        json: async () => {
          if (String(path) === 'api/study/sets') {
            const maybeFail = o.start as { status?: unknown; body?: unknown } | undefined;
            if (maybeFail && typeof maybeFail.status === 'number') {
              throw httpError(maybeFail.status as number, maybeFail.body);
            }
            return (o.start as StudyActiveSet) ?? makeSet();
          }
          if (String(path).endsWith('/submit')) return o.submit ?? submittedSet();
          if (String(path).endsWith('/abandon')) return o.abandon ?? makeSet({ status: 'abandoned' });
          throw httpError(404, { error: 'not_found' });
        },
      };
    }),
    patch: vi.fn((_path: string, opts?: { json?: unknown }) => {
      patchCalls += 1;
      calls.patch.push((opts as { json?: unknown })?.json);
      return {
        json: async () => {
          if (o.patchFailTimes && patchCalls <= o.patchFailTimes) throw new TypeError('fetch failed');
          if (o.patchHttpFailTimes && patchCalls <= o.patchHttpFailTimes) throw httpError(500, { error: 'internal' });
          return { outcome: 'answered' };
        },
      };
    }),
  } as unknown as ApiClient;
}

function renderStudy(client: ApiClient) {
  window.history.replaceState(null, '', '/');
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

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('학습 시작', () => {
  it('범위 선택 + 영역 선택 + 시작 버튼을 렌더링한다', () => {
    renderStudy(fakeStudyClient());
    expect(screen.getByText('학습 범위 선택')).toBeInTheDocument();
    expect(screen.getByText('전체 20문제')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '학습 시작' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('영역별 20문제'));
    expect(screen.getByLabelText('영역')).toBeInTheDocument();
  });

  it('시작 대기 중 버튼 라벨은 "시작하는 중"이다(#148)', async () => {
    let resolveStart: (v: StudyActiveSet) => void = () => {};
    const pending = new Promise<StudyActiveSet>((resolve) => {
      resolveStart = resolve;
    });
    const client = {
      ...fakeStudyClient(),
      post: vi.fn(() => ({ json: () => pending })),
    } as unknown as ApiClient;
    renderStudy(client);
    fireEvent.click(screen.getByRole('button', { name: copy.study.startAction }));

    const btn = await screen.findByRole('button', { name: copy.study.starting });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      resolveStart(makeSet());
    });
  });

  it('시작 성공 시 문제 화면(1/20·문제 본문·보기 텍스트)을 보인다', async () => {
    renderStudy(fakeStudyClient({ start: makeSet() }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    expect(await screen.findByText(/1\/20/)).toBeInTheDocument();
    expect(screen.getByText('문제 0 본문: VPC와 서브넷 구성은?')).toBeInTheDocument();
    expect(screen.getByText('1. 보기 q-0-a 내용')).toBeInTheDocument();
    expect(screen.getByLabelText(/보기 1/)).toBeInTheDocument();
  });

  it('409면 이어풀기 안내를 보인다', async () => {
    renderStudy(fakeStudyClient({ start: { status: 409, body: { error: 'active_set_exists' } } }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    expect(await screen.findByText(/이미 진행 중인 세트/)).toBeInTheDocument();
  });

  it('401이면 로그인 안내와 다른 기기 로그인 시 세션 만료 가능 문구를 보인다', async () => {
    renderStudy(fakeStudyClient({ start: { status: 401, body: { error: 'unauthorized' } } }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    expect(await screen.findByText(/로그인이 필요합니다/)).toBeInTheDocument();
    expect(screen.getByText(/다른 기기에서 로그인하면 현재 세션이 만료될 수 있습니다/)).toBeInTheDocument();
  });
});

describe('문제 풀이·자동 저장', () => {
  it('보기 선택 시 PATCH하고 저장됨을 표시한다', async () => {
    const calls = { patch: [] as unknown[], post: [] as string[] };
    renderStudy(fakeStudyClient({ start: makeSet(), calls }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/20/);
    fireEvent.click(screen.getByLabelText(/보기 1/));
    await waitFor(() => expect(calls.patch.length).toBe(1));
    expect(await screen.findByText('저장됨')).toBeInTheDocument();
  });

  it('Pass 버튼은 pass 응답을 PATCH한다', async () => {
    const calls = { patch: [] as unknown[], post: [] as string[] };
    renderStudy(fakeStudyClient({ start: makeSet(), calls }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/20/);
    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
    await waitFor(() => expect(calls.patch.length).toBe(1));
    expect(calls.patch[0]).toMatchObject({ response: { kind: 'pass' } });
  });

  it('HTTP 오류 저장 실패 시 오류를 보이고 다시 시도하면 초안을 재전송한다', async () => {
    const calls = { patch: [] as unknown[], post: [] as string[] };
    renderStudy(fakeStudyClient({ start: makeSet(), get: makeSet(), patchHttpFailTimes: 1, calls }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/20/);
    fireEvent.click(screen.getByLabelText(/보기 1/));
    expect(await screen.findByText(/저장 실패/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(calls.patch.length).toBe(2));
    expect(await screen.findByText('저장됨')).toBeInTheDocument();
  });

  it('PATCH 네트워크 실패는 오프라인 임시 저장으로 표시하고 선택을 유지한다(#52)', async () => {
    const calls = { patch: [] as unknown[], post: [] as string[] };
    // GET도 함께 실패(전체 오프라인) — 낙관적 선택이 서버 확인 전에 지워지지 않는다
    renderStudy(fakeStudyClient({ start: makeSet(), patchFailTimes: 99, calls }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/20/);
    fireEvent.click(screen.getByLabelText(/보기 1/));
    expect(await screen.findByText('오프라인 임시 저장')).toBeInTheDocument();
    expect(screen.getByLabelText(/보기 1/)).toBeChecked(); // optimistic 선택 유지 (롤백 없음)
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument(); // 서버 확인 전 '저장됨' 금지
    expect(Object.keys(window.localStorage).some((k) => k.startsWith('moi.study.draft.v1'))).toBe(true);
  });

  it('이전/다음으로 이동한다', async () => {
    renderStudy(fakeStudyClient({ start: makeSet() }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/20/);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText(/2\/20/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(await screen.findByText(/1\/20/)).toBeInTheDocument();
  });
});

describe('제출·결과·포기', () => {
  it('미응답이 있으면 확인 대화상자 후 제출 → 결과 화면', async () => {
    renderStudy(fakeStudyClient({ start: makeSet(), submit: submittedSet() }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/20/);
    fireEvent.click(screen.getByRole('button', { name: /제출하기/ }));
    expect(await screen.findByText(/풀지 않은 문제/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '제출 확인' }));
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    expect(screen.getByText(/정답률 5%/)).toBeInTheDocument();
    const item = screen.getByTestId('peritem-q-0');
    expect(within(item).getAllByText(/정답/).length).toBeGreaterThanOrEqual(1);
    expect(within(item).getByText(/문제 0 해설: 정답은 q-0-a이다/)).toBeInTheDocument();
    const link = within(item).getByRole('link', { name: 'Q 0' });
    expect(link).toHaveAttribute('href', 'https://docs.aws.amazon.com/q-0');
    expect(link).toHaveAttribute('title', 'https://docs.aws.amazon.com/q-0');
    expect(link).not.toHaveTextContent(/https?:\/\//);
    expect(screen.queryByText(/해설·근거·북마크는 후속/)).not.toBeInTheDocument();
  });

  it('포기는 확인 후 시작 화면으로 돌아간다', async () => {
    renderStudy(fakeStudyClient({ start: makeSet() }));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/20/);
    fireEvent.click(screen.getByRole('button', { name: '포기하기' }));
    expect(await screen.findByText(/정말 포기할까요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '포기 확인' }));
    await waitFor(() => expect(screen.getByText('학습 범위 선택')).toBeInTheDocument());
  });

  it('제출된 세트 URL 복구 시 결과 화면을 보인다', async () => {
    window.history.replaceState(null, '', '/?study=set-1');
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
    const client = fakeStudyClient({ get: submittedSet() });
    render(
      <QueryClientProvider client={queryClient}>
        <StudyScreen client={client} userId="user-1" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
  });
});
