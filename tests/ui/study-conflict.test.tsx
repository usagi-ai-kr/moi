import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, ItemResponse, StudyActiveSet } from '../../src/ui/api/client';
import { App } from '../../src/ui/App';
import { draftKey, saveDraft } from '../../src/ui/study/drafts';
import { StudyScreen } from '../../src/ui/study/StudyScreen';
import { useStudyUiStore } from '../../src/ui/study/store';
import { tabKey } from '../../src/ui/study/tab-state';

// #52 w2 — 충돌 패널·제출 차단·제출 완료 초안 정리·탭 복구·로그아웃 계정 격리를 UI 동작으로 고정한다.

function httpError(status: number, body: unknown, url = 'http://localhost/api/study/sets'): HTTPError {
  return new HTTPError(new Response(JSON.stringify(body), { status }), new Request(url), {} as never);
}

const B: ItemResponse = { kind: 'answered', optionIds: ['q-0-b'] };
const C: ItemResponse = { kind: 'answered', optionIds: ['q-0-c'] };
const D: ItemResponse = { kind: 'answered', optionIds: ['q-0-d'] };

function makeSet(overrides?: Partial<StudyActiveSet>): StudyActiveSet {
  const items = Array.from({ length: 10 }, (_, i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`],
    stem: `문제 ${i} 본문: VPC와 서브넷 구성은?`,
    options: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`].map((id) => ({
      optionId: id,
      text: `보기 ${id} 내용`,
    })),
    answerCount: 1,
    response: { kind: 'unanswered' as const },
  }));
  return {
    id: 'set-1',
    userId: 'user-1',
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
      accuracyPercent: 10,
      passCount: 1,
      unansweredCount: 8,
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

interface FakeOpts {
  get?: StudyActiveSet;
  patchFailTimes?: number;
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
        throw httpError(404, { error: 'not_found' });
      },
    })),
    post: vi.fn((path: string) => {
      calls.post.push(String(path));
      return {
        json: async () => {
          if (String(path).endsWith('/submit')) return submittedSet();
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
          return { outcome: 'answered' };
        },
      };
    }),
  } as unknown as ApiClient;
}

function resetUi() {
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
}

function renderStudyAtSet(client: ApiClient, userId = 'user-1') {
  window.history.replaceState(null, '', '/?study=set-1');
  resetUi();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudyScreen client={client} userId={userId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('충돌 패널 (#52)', () => {
  // 서버가 base(B)를 지나 제3의 답안(D)으로 바뀐 상태 — 자동 덮어쓰기 금지, 사용자 선택 필요
  function seedConflictDraft() {
    saveDraft(window.localStorage, 'user-1', 'set-1', 'q-0', C, B);
  }
  function conflictSet(): StudyActiveSet {
    const set = makeSet();
    set.items[0] = { ...set.items[0], response: D };
    return set;
  }

  it('충돌 초안 + 서버 제3의 답안 → 충돌 패널에 서버/내 답안을 보이고, `내 답안 사용`은 PATCH 후 초안을 제거한다', async () => {
    seedConflictDraft();
    const calls = { patch: [] as unknown[], post: [] as string[] };
    renderStudyAtSet(fakeStudyClient({ get: conflictSet(), calls }));

    expect(await screen.findByText('답안 충돌 확인')).toBeInTheDocument();
    // 서버 답안 D / 내 답안 C 표시 (보기 텍스트로)
    expect(screen.getByText(/서버 답안: 보기 q-0-d 내용/)).toBeInTheDocument();
    expect(screen.getByText(/내 답안: 보기 q-0-c 내용/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '내 답안 사용' }));
    await waitFor(() => expect(calls.patch.length).toBe(1));
    expect(calls.patch[0]).toMatchObject({ questionId: 'q-0', response: C });
    await waitFor(() => expect(screen.queryByText('답안 충돌 확인')).not.toBeInTheDocument());
    expect(window.localStorage.getItem(draftKey('user-1', 'set-1', 'q-0'))).toBeNull();
  });

  it('`서버 답안 사용`은 PATCH 없이 초안만 제거한다', async () => {
    seedConflictDraft();
    const calls = { patch: [] as unknown[], post: [] as string[] };
    renderStudyAtSet(fakeStudyClient({ get: conflictSet(), calls }));

    expect(await screen.findByText('답안 충돌 확인')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '서버 답안 사용' }));
    await waitFor(() => expect(screen.queryByText('답안 충돌 확인')).not.toBeInTheDocument());
    expect(calls.patch.length).toBe(0);
    expect(window.localStorage.getItem(draftKey('user-1', 'set-1', 'q-0'))).toBeNull();
  });
});

describe('제출 차단 (#52)', () => {
  it('충돌 초안이 있으면 제출 요청을 막고 안내를 보인다 — submit POST 없음', async () => {
    saveDraft(window.localStorage, 'user-1', 'set-1', 'q-0', C, B);
    const set = makeSet();
    set.items[0] = { ...set.items[0], response: D };
    const calls = { patch: [] as unknown[], post: [] as string[] };
    renderStudyAtSet(fakeStudyClient({ get: set, calls }));

    expect(await screen.findByText('답안 충돌 확인')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /제출하기/ }));
    expect(await screen.findByText(/전송하지 못한 답안이나 충돌이 있습니다/)).toBeInTheDocument();
    expect(calls.post.filter((p) => p.endsWith('/submit'))).toHaveLength(0);
  });

  it('미전송(오프라인) 초안이 있으면 제출을 막는다 — submit POST 없음', async () => {
    // base가 서버 확인값(unanswered)과 같은 초안 — 재전송 시도가 실패하면 미전송으로 남는다
    saveDraft(window.localStorage, 'user-1', 'set-1', 'q-0', C, { kind: 'unanswered' });
    const calls = { patch: [] as unknown[], post: [] as string[] };
    renderStudyAtSet(fakeStudyClient({ get: makeSet(), patchFailTimes: 99, calls }));

    expect(await screen.findByText(/1\/10/)).toBeInTheDocument();
    expect(await screen.findByText('오프라인 임시 저장')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /제출하기/ }));
    expect(await screen.findByText('오프라인 임시 저장')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /제출하기/ }));
    expect(await screen.findByText(/전송하지 못한 답안이나 충돌이 있습니다/)).toBeInTheDocument();
    expect(calls.post.filter((p) => p.endsWith('/submit'))).toHaveLength(0);
  });
});

describe('제출 완료 세트의 남은 초안 (#52)', () => {
  it('초안이 있어도 GET set이 submitted면 결과 화면을 보이고 PATCH 없이 초안을 제거한다', async () => {
    saveDraft(window.localStorage, 'user-1', 'set-1', 'q-0', C, B);
    const calls = { patch: [] as unknown[], post: [] as string[] };
    renderStudyAtSet(fakeStudyClient({ get: submittedSet(), calls }));

    expect(await screen.findByText('학습 결과')).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(draftKey('user-1', 'set-1', 'q-0'))).toBeNull());
    expect(calls.patch.length).toBe(0);
  });
});

describe('탭 상태 복구 (#52)', () => {
  it('sessionStorage의 view/index로 복구하고 이동 후 index를 갱신한다', async () => {
    window.sessionStorage.setItem(
      tabKey('user-1', 'set-1'),
      JSON.stringify({ version: 1, view: 'active', index: 3 }),
    );
    renderStudyAtSet(fakeStudyClient({ get: makeSet() }));

    expect(await screen.findByText(/4\/10/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText(/5\/10/)).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(window.sessionStorage.getItem(tabKey('user-1', 'set-1')) as string);
      expect(saved).toMatchObject({ view: 'active', index: 4 });
    });
  });
});

describe('로그아웃·계정 격리 (#52)', () => {
  const idA = 'aaaa1111-2222-3333-4444-555566667777';
  const idB = 'bbbb1111-2222-3333-4444-555566667777';

  function logoutClient(): ApiClient {
    let loggedOut = false;
    return {
      get: vi.fn(() => ({
        json: async () => {
          if (loggedOut) throw httpError(401, { error: 'unauthorized' }, 'http://localhost/api/me');
          return { user: { id: idA } };
        },
      })),
      post: vi.fn(async () => {
        loggedOut = true;
        return new Response(null, { status: 204 });
      }),
    } as unknown as ApiClient;
  }

  it('로그아웃(204) 성공 시 로그인 계정(A) 초안만 제거하고 다른 계정(B) 초안은 보존한다', async () => {
    saveDraft(window.localStorage, idA, 'set-a', 'q-0', C, B);
    saveDraft(window.localStorage, idB, 'set-b', 'q-0', C, B);
    window.history.replaceState(null, '', '/account');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <App client={logoutClient()} />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('link', { name: '계정' }));
    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));
    expect(await screen.findByRole('link', { name: '카카오 로그인' })).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(draftKey(idA, 'set-a', 'q-0'))).toBeNull());
    expect(window.localStorage.getItem(draftKey(idB, 'set-b', 'q-0'))).not.toBeNull();
  });

  it('다른 userId로 StudyScreen을 렌더해도 A 초안이 충돌·화면에 노출되지 않는다', async () => {
    // A 계정의 충돌 초안을 심고, B 계정(userId)으로 렌더 — B에게는 충돌이 없어야 한다
    saveDraft(window.localStorage, idA, 'set-1', 'q-0', C, B);
    const set = makeSet();
    set.items[0] = { ...set.items[0], response: D };
    const calls = { patch: [] as unknown[], post: [] as string[] };
    renderStudyAtSet(fakeStudyClient({ get: set, calls }), idB);

    expect(await screen.findByText(/1\/10/)).toBeInTheDocument();
    expect(screen.queryByText('답안 충돌 확인')).not.toBeInTheDocument();
    expect(calls.patch.length).toBe(0);
    // A 초안은 그대로 보존된다
    expect(window.localStorage.getItem(draftKey(idA, 'set-1', 'q-0'))).not.toBeNull();
  });
});
