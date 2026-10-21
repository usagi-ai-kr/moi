// #260 — 0.2.4 polish: 북마크 설정/미설정 시각 구분·ReviewFeedback 중복 제거·날짜 하한.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { BookmarkButton } from '../../src/ui/review/BookmarkButton';
import { ReviewFeedback } from '../../src/ui/review/ReviewFeedback';
import { formatDateTime } from '../../src/ui/study/types';

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** 북마크 목록 모의 — 설정 상태면 q-1이 들어 있다. */
function apiClient(bookmarked: boolean): ApiClient {
  const items = bookmarked ? [{ questionId: 'q-1', stem: 'stem', options: [] }] : [];
  return {
    get: vi.fn(() => ({ json: async () => ({ examId: 'saa-c03', total: items.length, items }) })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function renderBookmark(bookmarked: boolean) {
  return render(
    <QueryClientProvider client={queryClient()}>
      <BookmarkButton client={apiClient(bookmarked)} examId="saa-c03" questionId="q-1" />
    </QueryClientProvider>,
  );
}

function renderFeedback() {
  return render(
    <QueryClientProvider client={queryClient()}>
      <ReviewFeedback
        client={apiClient(false)}
        examId="saa-c03"
        questionId="q-1"
        stem="stem"
        options={[{ optionId: 'opt-a', text: 'A' } as never]}
        graded={
          {
            correct: true,
            response: { kind: 'answered' },
            correctOptionIds: ['opt-a'],
            explanation: 'exp',
          } as never
        }
        hasNext={false}
        onEnd={() => {}}
        onNext={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('#260 북마크 설정/미설정 상태 구분', () => {
  it('설정 상태는 aria-pressed=true와 해제 라벨을 함께 알린다', async () => {
    renderBookmark(true);
    const button = await screen.findByRole('button', { name: copy.review.bookmarkRemove });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('북마크 해제');
  });

  it('설정 상태는 아이콘이 채워(fill)져 미설정과 모양이 다르다', async () => {
    renderBookmark(true);
    const button = await screen.findByRole('button', { name: copy.review.bookmarkRemove });
    const svg = button.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });

  it('미설정 상태는 aria-pressed=false·추가 라벨·선형 아이콘이다', async () => {
    renderBookmark(false);
    const button = await screen.findByRole('button', { name: copy.review.bookmarkAdd });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('북마크 추가');
    const svg = button.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('fill', 'none');
  });
});

describe('#260 ReviewFeedback 중복 표시 제거', () => {
  it('정답 표시는 아이콘 + 텍스트만 남고 ✓ 문자는 없다', () => {
    const { container } = renderFeedback();
    const option = screen.getByRole('listitem');
    const mark = within(option).getByText('정답');
    expect(mark.querySelectorAll('svg')).toHaveLength(1);
    expect(mark.textContent).not.toContain('✓');
    expect(container.textContent).not.toContain('✓');
  });
});

describe('#260 날짜 하한 — 작은 양수 1970 방지', () => {
  it('1~86399 같은 작은 양수는 1970 대신 날짜 정보 없음이다', () => {
    for (const v of [1, 60, 3600, 86399]) {
      expect(formatDateTime(v)).toBe(copy.study.unknownDate);
      expect(formatDateTime(v)).not.toMatch(/1970/);
    }
  });

  it('0·음수·NaN·Infinity·null·undefined도 날짜 정보 없음이다', () => {
    for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(formatDateTime(v as number)).toBe(copy.study.unknownDate);
    }
  });

  it('초와 ms는 같은 날짜로 표시되고 1970이 아니다', () => {
    expect(formatDateTime(1_700_000_010)).toBe(formatDateTime(1_700_000_010_000));
    expect(formatDateTime(1_700_000_010)).toContain('2023');
    expect(formatDateTime(1_700_000_010)).not.toMatch(/1970/);
  });

  it('하한 위 값(1e9초=2001년)은 그대로 표시된다', () => {
    expect(formatDateTime(1_000_000_000)).toContain('2001');
    expect(formatDateTime(1_000_000_000)).toBe(formatDateTime(1_000_000_000_000));
  });
});
