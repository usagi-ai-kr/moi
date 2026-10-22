import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Alert } from '../../src/ui/components/ui/alert';
import { Pagination } from '../../src/ui/components/ui/pagination';
import { copy } from '../../src/ui/copy';
import { BookmarkButton } from '../../src/ui/review/BookmarkButton';
import { ReviewFeedback } from '../../src/ui/review/ReviewFeedback';
import { AuthErrorAlert, LoadErrorAlert } from '../../src/ui/widgets';

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function apiClient() {
  return {
    get: vi.fn(() => ({ json: async () => ({ items: [] }) })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as import('../../src/ui/api/client').ApiClient;
}

describe('icons slice C — decorative aria-hidden', () => {
  it('Alert 아이콘은 장식용 aria-hidden이다', () => {
    render(<Alert variant="error">오류</Alert>);
    const svg = screen.getByRole('alert').querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('widgets 경고/닫기 아이콘은 장식용 aria-hidden이다', () => {
    render(<AuthErrorAlert />);
    const alert = screen.getByRole('alert');
    expect(alert.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const close = screen.getByRole('button', { name: copy.session.dismiss });
    expect(close.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('LoadErrorAlert 아이콘은 장식용 aria-hidden이다', () => {
    render(<LoadErrorAlert onRetry={() => {}} />);
    expect(screen.getByRole('alert').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('Pagination 이전/다음 아이콘은 장식용 aria-hidden이다', () => {
    render(<Pagination total={50} page={2} pageSize={10} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: '이전' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: '다음' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('icons slice C — BookmarkButton 상태 유지', () => {
  it('북마크 미설정 상태에서 aria-pressed=false와 라벨 텍스트를 유지한다', async () => {
    render(
      <QueryClientProvider client={queryClient()}>
        <BookmarkButton client={apiClient()} examId="saa-c03" questionId="q-1" />
      </QueryClientProvider>,
    );
    const button = await screen.findByRole('button', { name: /북마크 추가/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('북마크 추가');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('icons slice C — ReviewFeedback 상태 텍스트', () => {
  it('정답 피드백에서 상태 배지 텍스트를 유지한다', () => {
    render(
      <QueryClientProvider client={queryClient()}>
        <ReviewFeedback
          client={apiClient()}
          examId="saa-c03"
          questionId="q-1"
          stem="stem"
          options={[{ optionId: 'opt-a', text: 'A' } as never]}
          graded={{ correct: true, response: { kind: 'answered' }, correctOptionIds: ['opt-a'], explanation: 'exp' } as never}
          hasNext={false}
          onEnd={() => {}}
          onNext={() => {}}
        />
      </QueryClientProvider>,
    );
    // 상단 배지와 정답 보기 표시가 같은 문구를 쓴다(#260 — '✓' 문자 중복 제거).
    const marks = screen.getAllByText('정답');
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });
});

describe('icons slice C — 아이콘 단독 버튼 없음/있으면 계약', () => {
  it('widgets 닫기 버튼은 아이콘 단독이지만 aria-label과 44px 타깃을 가진다', () => {
    render(<AuthErrorAlert />);
    const close = screen.getByRole('button', { name: copy.session.dismiss });
    expect(close).toHaveAttribute('aria-label', copy.session.dismiss);
    // 44px는 CSS min-width/min-height로 보장된다.
    expect(close.className).toContain('moi-alert-close');
  });
});

describe('icons slice C — pagination/alert 아이콘 중복·누락', () => {
  it('Pagination에는 이전/다음 아이콘이 정확히 1개씩 있다', () => {
    render(<Pagination total={50} page={2} pageSize={10} onPageChange={() => {}} />);
    const prev = screen.getByRole('button', { name: '이전' });
    const next = screen.getByRole('button', { name: '다음' });
    expect(prev.querySelectorAll('svg')).toHaveLength(1);
    expect(next.querySelectorAll('svg')).toHaveLength(1);
  });

  it('Alert에는 아이콘이 정확히 1개 있다', () => {
    render(<Alert variant="info">안내</Alert>);
    expect(screen.getByRole('alert').querySelectorAll('svg')).toHaveLength(1);
  });
});