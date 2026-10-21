import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HTTPError } from 'ky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveItem } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { QuestionView } from '../../src/ui/study/QuestionView';
import { readRequestedSize, rememberRequestedSize } from '../../src/ui/study/queries';

// #275 F1 — 부족 안내 비교값 리셋 결함.
// 라우트 변경(/study/new→/study)으로 useStudyFlow가 remount되어 size가 4로 리셋돼도,
// QuestionView가 sessionStorage stash(요청 size)로 실제 길이 < 요청 size를 비교해 안내한다.
// StudyScreen(정확한 size 보유·legacy 경로)과 중복 표시하지 않는다.

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
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function makeItems(n: number): StudyActiveItem[] {
  return Array.from({ length: n }, (_, i) => ({
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
    response: { kind: 'unanswered' } as const,
  }));
}

function renderQuestion(items: StudyActiveItem[], setId = 'set-cur') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QuestionView
          client={fakeStudyClient()}
          items={items}
          setId={setId}
          index={0}
          save="idle"
          submitting={false}
          unansweredCount={items.length}
          submitError={null}
          onIndex={() => {}}
          onAnswer={() => {}}
          onPass={() => {}}
          onClear={() => {}}
          onRetry={() => {}}
          onSubmitRequest={() => {}}
          onAbandonRequest={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function atRouterStudyPath(): void {
  window.history.replaceState(null, '', '/study');
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('부족 안내 stash (queries, #275 r5 B1)', () => {
  it('기억·조회 왕복, 다른 시험은 null', () => {
    expect(readRequestedSize('saa-c03')).toBeNull();
    rememberRequestedSize('saa-c03', 8, 'set-cur');
    expect(readRequestedSize('saa-c03')).toEqual({ setId: 'set-cur', size: 8 });
    expect(readRequestedSize('other-exam')).toBeNull();
  });

  it('4|8 외 값은 null로 거부한다', () => {
    rememberRequestedSize('saa-c03', 5, 'set-cur');
    expect(readRequestedSize('saa-c03')).toBeNull();
  });
});

describe('부족 안내 표시 (QuestionView, #275 F1)', () => {
  it('풀5+8 → 안내를 표시한다', () => {
    atRouterStudyPath();
    rememberRequestedSize('saa-c03', 8, 'set-cur');
    renderQuestion(makeItems(5));
    expect(screen.getByText(copy.study.sizeAvailableNotice(5))).toBeInTheDocument();
  });

  it('풀4+8 → 안내를 표시한다', () => {
    atRouterStudyPath();
    rememberRequestedSize('saa-c03', 8, 'set-cur');
    renderQuestion(makeItems(4));
    expect(screen.getByText(copy.study.sizeAvailableNotice(4))).toBeInTheDocument();
  });

  it('다른 setId 기록이면 안내가 없다(오안내 방지)', () => {
    atRouterStudyPath();
    rememberRequestedSize('saa-c03', 8, 'set-old');
    renderQuestion(makeItems(5), 'set-cur');
    expect(screen.queryByText(/사용 가능한 .*문제로 시작했습니다/)).not.toBeInTheDocument();
  });

  it('풀4+4 → 안내가 없다', () => {
    atRouterStudyPath();
    rememberRequestedSize('saa-c03', 4, 'set-cur');
    renderQuestion(makeItems(4));
    expect(screen.queryByText(/사용 가능한 .*문제로 시작했습니다/)).not.toBeInTheDocument();
  });

  it('풀8+8 → 안내가 없다', () => {
    atRouterStudyPath();
    rememberRequestedSize('saa-c03', 8, 'set-cur');
    renderQuestion(makeItems(8));
    expect(screen.queryByText(/사용 가능한 .*문제로 시작했습니다/)).not.toBeInTheDocument();
  });

  it('stash 없음 → 안내가 없다(이전 동작 유지)', () => {
    atRouterStudyPath();
    renderQuestion(makeItems(5));
    expect(screen.queryByText(/사용 가능한 .*문제로 시작했습니다/)).not.toBeInTheDocument();
  });

  it('legacy 경로(/)에서는 표시하지 않는다(StudyScreen이 정확한 size로 표시)', () => {
    rememberRequestedSize('saa-c03', 8, 'set-cur');
    renderQuestion(makeItems(5));
    expect(screen.queryByText(/사용 가능한 .*문제로 시작했습니다/)).not.toBeInTheDocument();
  });

  it('실제 길이 < 기본값 구간은 표시하지 않는다(StudyScreen과 중복 방지)', () => {
    atRouterStudyPath();
    rememberRequestedSize('saa-c03', 4, 'set-cur');
    renderQuestion(makeItems(2));
    expect(screen.queryByText(/사용 가능한 .*문제로 시작했습니다/)).not.toBeInTheDocument();
  });
});

