// #314 — 복습 후보 캐시의 계정 격리(잘못된 계정 목록 노출 방지).
//  · 복습 캐시 키(후보·회차·북마크)가 모두 userId 를 포함하는지
//  · 계정 A → 계정 B 전환 시 A 의 후보가 노출되지 않는지
//  · 로그아웃 시 이전 계정의 복습 캐시가 제거되는지
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { ME_QUERY_KEY, useLogout } from '../../src/ui/session';
import { useBookmarks } from '../../src/ui/review/bookmark-queries';
import {
  useCurrentReviewSession,
  useReviewCandidates,
} from '../../src/ui/review/queries';

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`http error ${status}`), {
    response: new Response(JSON.stringify(body), { status }),
  });
}

/** 현재 로그인 계정을 바꿀 수 있는 가짜 클라이언트 — 계정별 후보를 돌려준다. */
function fakeClient(current: { userId: string; loggedOut: boolean }) {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        const u = new URL(String(path), 'http://localhost/');
        if (u.pathname === '/api/me') {
          return { user: { id: current.userId, createdAt: null, lastLoginAt: null } };
        }
        // 로그아웃 후에는 인증이 끊겼다 — 보호 API 는 401 이다(실서비스 동일).
        if (current.loggedOut) throw httpError(401, { error: 'unauthorized' });
        if (u.pathname === '/api/review/candidates') {
          return {
            examId: 'saa-c03',
            mode: 'wrong',
            total: 1,
            items: [
              {
                questionId: `q-${current.userId}`,
                validWrongCount: 1,
                stem: `stem-${current.userId}`,
                options: [],
              },
            ],
          };
        }
        if (u.pathname === '/api/review/sessions/current') {
          return {
            examId: 'saa-c03',
            mode: 'wrong',
            status: 'active',
            cursor: 1,
            total: 1,
            current: null,
            exhausted: false,
            items: [],
          };
        }
        if (u.pathname === '/api/review/bookmarks') {
          return { examId: 'saa-c03', total: 0, items: [] };
        }
        return {};
      },
    })),
    post: vi.fn(async (path: string) => {
      if (String(path).includes('auth/logout')) {
        current.loggedOut = true;
        return new Response(null, { status: 204 });
      }
      throw httpError(404, { error: 'not_found' });
    }),
  } as unknown as ApiClient;
}

function ReviewProbe({ client }: { client: ApiClient }) {
  const candidates = useReviewCandidates(client, 'saa-c03', 'wrong');
  useCurrentReviewSession(client, 'saa-c03', 'wrong');
  // #307 이 북마크 훅을 bookmark-queries 로 옮기고 userId 인자를 추가했다 — 계정 키를 고정해 쓴다.
  useBookmarks(client, 'saa-c03', 'u-a');
  const items = candidates.data?.items ?? [];
  return <div data-testid="candidates">{items.map((i) => i.questionId).join(',')}</div>;
}

function LogoutProbe({ client }: { client: ApiClient }) {
  const logout = useLogout(client, 'u-a');
  return (
    <button type="button" onClick={() => void logout()}>
      로그아웃
    </button>
  );
}

/** 실제 앱과 동일하게 세션(‘me’)을 먼저 확정한 뒤 화면을 렌더한다. */
function renderWithClient(client: ApiClient, ui: React.ReactElement, userId = 'u-a') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, { id: userId, createdAt: null, lastLoginAt: null });
  const utils = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

function reviewCacheKeys(queryClient: QueryClient): readonly (readonly unknown[])[] {
  return queryClient
    .getQueryCache()
    .getAll()
    .map((q) => q.queryKey as readonly unknown[])
    .filter((key) => key[0] === 'review');
}

describe('#314 복습 캐시 계정 격리', () => {
  it('복습 캐시 키(후보·회차·북마크)가 모두 userId 를 포함한다', async () => {
    const current = { userId: 'u-a', loggedOut: false };
    const client = fakeClient(current);
    const { queryClient } = renderWithClient(client, <ReviewProbe client={client} />);
    await waitFor(() => expect(reviewCacheKeys(queryClient).length).toBeGreaterThan(0));

    const keys = reviewCacheKeys(queryClient);
    for (const key of keys) {
      expect(key, '복습 캐시 키에 userId 가 있어야 한다').toContain('u-a');
    }
    // 후보·회차·북마크 세 종류가 모두 사용자 키를 갖는다.
    const kinds = new Set(keys.map((key) => key[1]));
    expect(kinds).toEqual(new Set(['candidates', 'current', 'bookmarks']));
  });

  it('계정 A → 계정 B 전환 시 A 의 후보가 노출되지 않는다', async () => {
    const current = { userId: 'u-a', loggedOut: false };
    const client = fakeClient(current);
    const { queryClient } = renderWithClient(client, <ReviewProbe client={client} />);
    await waitFor(() => expect(screen.getByTestId('candidates')).toHaveTextContent('q-u-a'));

    // 계정 B 로 전환(로그인 세션 교체).
    current.userId = 'u-b';
    queryClient.setQueryData(ME_QUERY_KEY, { id: 'u-b', createdAt: null, lastLoginAt: null });

    await waitFor(() => expect(screen.getByTestId('candidates')).toHaveTextContent('q-u-b'));
    expect(screen.getByTestId('candidates')).not.toHaveTextContent('q-u-a');
  });

  it('로그아웃 시 이전 계정의 복습 캐시 데이터가 남지 않는다', async () => {
    const current = { userId: 'u-a', loggedOut: false };
    const client = fakeClient(current);
    const { queryClient } = renderWithClient(
      client,
      <>
        <ReviewProbe client={client} />
        <LogoutProbe client={client} />
      </>,
    );
    await waitFor(() => expect(reviewCacheKeys(queryClient).length).toBeGreaterThan(0));
    // 로그아웃 전에는 계정 A 의 후보 데이터가 캐시에 있다.
    expect(
      reviewCacheKeys(queryClient).some((key) => queryClient.getQueryData(key as readonly unknown[]) !== undefined),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    // 로그아웃 후에는 이전 계정의 복습 캐시 데이터가 읽히지 않는다(제거 + 세션 종료로 401).
    await waitFor(() => {
      for (const key of reviewCacheKeys(queryClient)) {
        expect(
          queryClient.getQueryData(key as readonly unknown[]),
          `복습 캐시에 이전 계정 데이터가 남아 있다: ${JSON.stringify(key)}`,
        ).toBeUndefined();
      }
    });
    expect(screen.getByTestId('candidates')).not.toHaveTextContent('q-u-a');
  });
});
