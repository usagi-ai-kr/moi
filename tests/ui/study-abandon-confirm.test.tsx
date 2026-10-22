import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HTTPError } from 'ky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveSet } from '../../src/ui/api/client';
import { StudyScreen } from '../../src/ui/study/StudyScreen';
import { useStudyUiStore } from '../../src/ui/study/store';

// #223 포기 확인 UI — 제목/본문/액션 분리, 안전한 취소 기본, 확정 1회, 실패·지연 안전.
// jsdom bbox는 0이므로 크기·겹침은 Playwright가 검증한다. RTL은 역할·문구·API 횟수·포커스만 본다.

const TITLE = '정말 학습을 포기하시겠습니까?';
const DESC = '포기한 세트는 채점되지 않습니다.';
const ERROR = '포기하지 못했습니다. 다시 시도해 주세요.';

function makeSet(): StudyActiveSet {
  const items = Array.from({ length: 10 }, (_, i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`],
    stem: `문제 ${i} 본문: VPC와 서브넷 구성은?`,
    options: [`q-${i}-a`, `q-${i}-b`].map((id) => ({ optionId: id, text: `보기 ${id} 내용` })),
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

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(new Response(JSON.stringify(body), { status }), new Request('http://localhost/api/study/sets/set-1/abandon'), {} as never);
}

interface FakeOpts {
  abandonImpl?: () => Promise<StudyActiveSet>;
  calls?: { abandon: number };
}

function fakeStudyClient(o: FakeOpts = {}): ApiClient {
  const calls = o.calls ?? { abandon: 0 };
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
        if (String(path).endsWith('/abandon')) {
          calls.abandon += 1;
          if (o.abandonImpl) return o.abandonImpl();
          return { ...makeSet(), status: 'abandoned' };
        }
        throw httpError(404, { error: 'not_found' });
      },
    })),
    patch: vi.fn(() => ({ json: async () => ({ outcome: 'answered' }) })),
  } as unknown as ApiClient;
}

function renderStudy(client: ApiClient) {
  window.history.replaceState(null, '', '/');
  useStudyUiStore.setState({
    view: 'start',
    scope: 'all',
    domainId: 'dom-security',
    size: 4,
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

async function startAndAbandon(client: ApiClient) {
  renderStudy(client);
  fireEvent.click(await screen.findByRole('button', { name: '학습 시작' }));
  await screen.findByText(/1\/10/);
  fireEvent.click(screen.getByRole('button', { name: '포기하기' }));
  return screen.findByRole('alertdialog', { name: TITLE });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('#223 포기 확인 — 정보 위계와 확인 전 API 0 (AC1)', () => {
  it('제목/설명/취소/포기확인이 분리 표시되고 풀이가 유지되며 포기 API는 0회다', async () => {
    const calls = { abandon: 0 };
    const dialog = await startAndAbandon(fakeStudyClient({ calls }));
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(DESC)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '포기 확인' })).toBeInTheDocument();
    expect(calls.abandon).toBe(0);
    expect(screen.getByText('문제 0 본문: VPC와 서브넷 구성은?')).toBeInTheDocument();
    expect(screen.getByText(/1\/10/)).toBeInTheDocument();
  });

  it('취소 버튼이 기본 포커스를 갖는다', async () => {
    await startAndAbandon(fakeStudyClient());
    await waitFor(() => expect(document.activeElement).toHaveAccessibleName('취소'));
  });

  it('확인·취소 버튼은 44px 토큰을 갖는다', async () => {
    await startAndAbandon(fakeStudyClient());
    for (const name of ['취소', '포기 확인']) {
      const cls = (screen.getByRole('button', { name }).getAttribute('class') ?? '').split(/\s+/);
      expect(cls).toContain('min-h-[44px]');
    }
  });
});

describe('#223 포기 확인 — 취소/Escape (AC2)', () => {
  it('취소 시 포기 요청 없이 풀이로 복귀하고 트리거에 포커스가 복원된다', async () => {
    const calls = { abandon: 0 };
    await startAndAbandon(fakeStudyClient({ calls }));
    fireEvent.click(screen.getByLabelText(/보기 1/));
    await screen.findByText('저장됨');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls.abandon).toBe(0);
    expect(screen.getByText(/1\/10/)).toBeInTheDocument();
    expect(screen.getByLabelText(/보기 1/)).toBeChecked();
    expect(document.activeElement).toHaveAccessibleName('포기하기');
  });

  it('Escape 시 포기 요청 없이 풀이로 복귀하고 트리거에 포커스가 복원된다', async () => {
    const calls = { abandon: 0 };
    await startAndAbandon(fakeStudyClient({ calls }));
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls.abandon).toBe(0);
    expect(screen.getByText(/1\/10/)).toBeInTheDocument();
    expect(document.activeElement).toHaveAccessibleName('포기하기');
  });
});

describe('#223 포기 확인 — 확정 1회와 성공 전이 (AC3)', () => {
  it('연속 클릭해도 포기 요청은 정확히 1회이며 성공 후 시작 화면으로 이동한다', async () => {
    const calls = { abandon: 0 };
    await startAndAbandon(fakeStudyClient({ calls }));
    const confirm = screen.getByRole('button', { name: '포기 확인' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByText('학습 범위 선택')).toBeInTheDocument());
    expect(calls.abandon).toBe(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('#223 포기 확인 — 실패/지연 (AC4)', () => {
  it('pending 중 스피너·버튼 비활성·취소 잠금을 보이고 중복 요청이 없다', async () => {
    const calls = { abandon: 0 };
    let resolveAbandon: (v: StudyActiveSet) => void = () => {};
    const gate = new Promise<StudyActiveSet>((resolve) => {
      resolveAbandon = resolve;
    });
    await startAndAbandon(fakeStudyClient({ calls, abandonImpl: () => gate }));
    const confirm = screen.getByRole('button', { name: '포기 확인' });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    fireEvent.click(confirm);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(calls.abandon).toBe(1);
    resolveAbandon({ ...makeSet(), status: 'abandoned' });
    await waitFor(() => expect(screen.getByText('학습 범위 선택')).toBeInTheDocument());
    expect(calls.abandon).toBe(1);
  });

  it('실패 시 창·오류·답안을 유지하고 재시도할 수 있다', async () => {
    const calls = { abandon: 0 };
    let fail = true;
    await startAndAbandon(
      fakeStudyClient({
        calls,
        abandonImpl: async () => {
          if (fail) throw httpError(500, { error: 'internal' });
          return { ...makeSet(), status: 'abandoned' };
        },
      }),
    );
    fireEvent.click(screen.getByLabelText(/보기 1/));
    await screen.findByText('저장됨');
    fireEvent.click(screen.getByRole('button', { name: '포기 확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR);
    expect(screen.getByRole('alertdialog', { name: TITLE })).toBeInTheDocument();
    expect(screen.getByText('문제 0 본문: VPC와 서브넷 구성은?')).toBeInTheDocument();
    expect(screen.getByLabelText(/보기 1/)).toBeChecked();
    expect(calls.abandon).toBe(1);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '포기 확인' }));
    await waitFor(() => expect(screen.getByText('학습 범위 선택')).toBeInTheDocument());
    expect(calls.abandon).toBe(2);
  });

  it('401 실패 시 로그인 안내를 보인다', async () => {
    await startAndAbandon(
      fakeStudyClient({
        abandonImpl: async () => {
          throw httpError(401, { error: 'unauthorized' });
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '포기 확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/로그인이 필요합니다/);
    expect(screen.getByRole('alertdialog', { name: TITLE })).toBeInTheDocument();
  });
});
