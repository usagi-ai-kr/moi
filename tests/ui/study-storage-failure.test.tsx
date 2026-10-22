import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveSet } from '../../src/ui/api/client';
import { StudyScreen } from '../../src/ui/study/StudyScreen';
import { useStudyUiStore } from '../../src/ui/study/store';

// #52 AC7·AC2/3 — 브라우저 저장 실패(localStorage 쿼터·차단)와 네트워크 실패가 겹쳐도
// 선택 답안을 잃지 않고, 재시도로 같은 답안을 한 번만 재전송하며, 서버 성공 전 '저장됨'을 표시하지 않는다.

function makeSet(): StudyActiveSet {
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
  };
}

interface Calls {
  patch: unknown[];
  post: string[];
}

// 시작 직후 네트워크가 끊긴 상태 — 첫 PATCH는 실패하고 이후 GET도 실패한다(낙관적 선택 유지).
function clientWithDroppedNetwork(calls: Calls): ApiClient {
  let patchCalls = 0;
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).includes('api/review/bookmarks')) return { examId: 'saa-c03', total: 0, items: [] };
        throw new TypeError('fetch failed');
      },
    })),
    post: vi.fn((path: string) => {
      calls.post.push(String(path));
      return {
        json: async () => {
          if (String(path) === 'api/study/sets') return makeSet();
          throw new TypeError('fetch failed');
        },
      };
    }),
    patch: vi.fn((_path: string, opts?: { json?: unknown }) => {
      patchCalls += 1;
      calls.patch.push((opts as { json?: unknown })?.json);
      return {
        json: async () => {
          if (patchCalls === 1) throw new TypeError('fetch failed');
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('브라우저 저장 실패 + 네트워크 실패 재시도 (#52)', () => {
  it('보기 선택 → 재시도 시 선택 답안을 보존하고 같은 문제를 한 번만 재전송한다', async () => {
    const calls: Calls = { patch: [], post: [] };
    renderStudy(clientWithDroppedNetwork(calls));
    fireEvent.click(screen.getByRole('button', { name: '학습 시작' }));
    await screen.findByText(/1\/10/);

    // localStorage.setItem만 쿼터 초과로 실패 — 읽기·다른 저장소는 정상인 실제 브라우저와 같은 조건
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    fireEvent.click(screen.getByLabelText(/보기 1/));
    expect(await screen.findByText(/저장 실패/)).toBeInTheDocument();
    expect(calls.patch).toHaveLength(1);
    expect(screen.getByLabelText(/보기 1/)).toBeChecked(); // 서버 확인 전 선택 유지
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument(); // 서버 성공 전 완료 표시 금지
    expect(window.localStorage.length).toBe(0); // 초안은 기록되지 않았다

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(calls.patch).toHaveLength(2));
    expect(calls.patch[1]).toMatchObject({
      questionId: 'q-0',
      response: { kind: 'answered', optionIds: ['q-0-a'] },
    });
    expect(await screen.findByText('저장됨')).toBeInTheDocument();
    expect(screen.getByLabelText(/보기 1/)).toBeChecked();
    expect(calls.post.filter((p) => p.endsWith('/submit'))).toHaveLength(0); // 제출로 새지 않는다
  });
});
