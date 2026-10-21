import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HTTPError } from 'ky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveSet } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { StudyScreen } from '../../src/ui/study/StudyScreen';
import { useStudyUiStore } from '../../src/ui/study/store';

// #270 Red — 중복 인터랙션 잠금 재현 검증 (사실 확인 전 추정 단정 금지).
// 서버 멱등성은 Worker 테스트로 이미 보장됨. 여기서는 클라이언트 잠금 빈틈만 재현한다.

function httpError(status: number, body: unknown, url = 'http://localhost/api/study/sets'): HTTPError {
  return new HTTPError(new Response(JSON.stringify(body), { status }), new Request(url), {} as never);
}

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
    userId: 'u-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'active',
    createdAt: 1700000000000,
    items,
  };
}

function submittedSet(): StudyActiveSet {
  const base = makeSet();
  return {
    ...base,
    status: 'submitted',
    submittedAt: 1700000001000,
    items: base.items.map((it, i) => ({
      ...it,
      answerOptionIds: [`${it.questionId}-a`],
      explanation: `문제 ${i} 해설`,
      sourceUrls: [`https://docs.aws.amazon.com/q-${i}`],
    })),
    result: {
      answeredCount: 1,
      correctCount: 1,
      accuracyPercent: 10,
      passCount: 0,
      unansweredCount: 9,
      perItem: base.items.map((it, i) => ({
        questionId: it.questionId,
        responseKind: 'answered',
        selectedOptionIds: i === 0 ? [`${it.questionId}-a`] : [],
        correctOptionIds: [`${it.questionId}-a`],
        correct: i === 0,
      })),
    },
  } as StudyActiveSet;
}

function renderStudy(client: ApiClient, onNavigate?: (to: string) => void) {
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
      <MemoryRouter>
        <StudyScreen client={client} userId="user-1" onNavigate={onNavigate} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('#270 Red — 시작 pending 중 충돌 CTA 차단', () => {
  it('시작 요청 중 학습 이력 버튼이 비활성이다', async () => {
    let resolveStart: (v: StudyActiveSet) => void = () => {};
    const gate = new Promise<StudyActiveSet>((resolve) => {
      resolveStart = resolve;
    });
    const post = vi.fn(() => ({ json: () => gate }));
    const client = {
      get: vi.fn((_p: string) => ({
        json: async () => {
          if (String(_p).includes('api/review/bookmarks')) return { examId: 'saa-c03', total: 0, items: [] };
          throw httpError(404, { error: 'not_found' });
        },
      })),
      post,
      patch: vi.fn(() => ({ json: async () => ({ outcome: 'answered' }) })),
    } as unknown as ApiClient;
    renderStudy(client, () => {});
    fireEvent.click(screen.getByRole('button', { name: copy.study.startAction }));
    const starting = await screen.findByRole('button', { name: copy.study.starting });
    expect(starting).toBeDisabled();
    const historyBtn = screen.getByRole('button', { name: copy.study.historyLink });
    // Red 기대: pending 중 이력 이동은 막혀야 한다.
    expect(historyBtn).toBeDisabled();
    expect(historyBtn).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      resolveStart(makeSet());
    });
  });

  it('시작 버튼 연속 클릭해도 POST는 1회만 나간다', async () => {
    let resolveStart: (v: StudyActiveSet) => void = () => {};
    const gate = new Promise<StudyActiveSet>((resolve) => {
      resolveStart = resolve;
    });
    let postCount = 0;
    const client = {
      get: vi.fn((_p: string) => ({
        json: async () => {
          if (String(_p).includes('api/review/bookmarks')) return { examId: 'saa-c03', total: 0, items: [] };
          throw httpError(404, { error: 'not_found' });
        },
      })),
      post: vi.fn((_p: string) => {
        if (String(_p) === 'api/study/sets') postCount += 1;
        return { json: () => gate };
      }),
      patch: vi.fn(() => ({ json: async () => ({ outcome: 'answered' }) })),
    } as unknown as ApiClient;
    renderStudy(client);
    const btn = screen.getByRole('button', { name: copy.study.startAction });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(postCount).toBe(1));
    await act(async () => {
      resolveStart(makeSet());
    });
    expect(postCount).toBe(1);
  });
});

describe('#270 Red — 제출 pending 중 경합 차단', () => {
  async function startAndOpenConfirm(submitGate: Promise<StudyActiveSet>, postCount: { submit: number }) {
    const client = {
      get: vi.fn((_p: string) => ({
        json: async () => {
          if (String(_p).includes('api/review/bookmarks')) return { examId: 'saa-c03', total: 0, items: [] };
          throw httpError(404, { error: 'not_found' });
        },
      })),
      post: vi.fn((p: string) => {
        if (String(p).endsWith('/submit')) postCount.submit += 1;
        return {
          json: async () => {
            if (String(p) === 'api/study/sets') return makeSet();
            if (String(p).endsWith('/submit')) return submitGate;
            if (String(p).endsWith('/abandon')) return { ...makeSet(), status: 'abandoned' };
            throw httpError(404, { error: 'not_found' });
          },
        };
      }),
      patch: vi.fn(() => ({ json: async () => ({ outcome: 'answered' }) })),
    } as unknown as ApiClient;
    renderStudy(client);
    fireEvent.click(screen.getByRole('button', { name: copy.study.startAction }));
    await screen.findByText(/1\/10/);
    fireEvent.click(screen.getByRole('button', { name: /제출하기/ }));
    expect(await screen.findByText(/풀지 않은 문제/)).toBeInTheDocument();
    return client;
  }

  it('제출 확인 연속 클릭해도 제출 POST는 1회만 나간다', async () => {
    let resolveSubmit: (v: StudyActiveSet) => void = () => {};
    const gate = new Promise<StudyActiveSet>((resolve) => {
      resolveSubmit = resolve;
    });
    const postCount = { submit: 0 };
    await startAndOpenConfirm(gate, postCount);
    const confirm = screen.getByRole('button', { name: copy.study.confirmSubmit });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(postCount.submit).toBe(1));
    await act(async () => {
      resolveSubmit(submittedSet());
    });
    expect(postCount.submit).toBe(1);
  });

  it('제출 요청 중 답안 입력·포기하기가 비활성이다', async () => {
    let resolveSubmit: (v: StudyActiveSet) => void = () => {};
    const gate = new Promise<StudyActiveSet>((resolve) => {
      resolveSubmit = resolve;
    });
    const postCount = { submit: 0 };
    await startAndOpenConfirm(gate, postCount);
    fireEvent.click(screen.getByRole('button', { name: copy.study.confirmSubmit }));
    const submitting = await screen.findByRole('button', { name: copy.study.confirmSubmit });
    expect(submitting).toBeDisabled();
    // Red 기대: 제출 중에는 답안 체크박스와 포기하기가 막혀야 한다.
    expect(screen.getByLabelText(/보기 1/)).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.study.pass })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.study.abandon })).toBeDisabled();
    await act(async () => {
      resolveSubmit(submittedSet());
    });
  });
});

describe('#270 Red — timeout 후 409 복구', () => {
  it('시작 timeout 후 재시도가 409면 이어풀기 안내를 보인다', async () => {
    let calls = 0;
    const client = {
      get: vi.fn((_p: string) => ({
        json: async () => {
          if (String(_p).includes('api/review/bookmarks')) return { examId: 'saa-c03', total: 0, items: [] };
          throw httpError(404, { error: 'not_found' });
        },
      })),
      post: vi.fn((_p: string) => ({
        json: async () => {
          if (String(_p) === 'api/study/sets') {
            calls += 1;
            if (calls === 1) throw new TypeError('fetch failed');
            throw httpError(409, { error: 'active_set_exists' });
          }
          throw httpError(404, { error: 'not_found' });
        },
      })),
      patch: vi.fn(() => ({ json: async () => ({ outcome: 'answered' }) })),
    } as unknown as ApiClient;
    renderStudy(client);
    fireEvent.click(screen.getByRole('button', { name: copy.study.startAction }));
    expect(await screen.findByRole('alert')).toHaveTextContent('시작하지 못했습니다');
    fireEvent.click(screen.getByRole('button', { name: copy.study.startAction }));
    expect(await screen.findByText(/이미 진행 중인 세트/)).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});
