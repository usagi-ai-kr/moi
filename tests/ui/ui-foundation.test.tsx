import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Alert } from '../../src/ui/components/ui/alert';
import { ConfirmDialog } from '../../src/ui/components/ui/alert-dialog';
import { Button } from '../../src/ui/components/ui/button';
import { Pagination } from '../../src/ui/components/ui/pagination';
import { Skeleton } from '../../src/ui/components/ui/skeleton';
import { cn } from '../../src/ui/lib/utils';

describe('ui-foundation (Tailwind·shadcn 기반)', () => {
  it('cn: clsx 조합 + tailwind-merge 충돌 해소', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });

  it('Button: variant/size data-slot, disabled/aria, pending spinner', () => {
    const { rerender } = render(<Button variant="primary" size="md">시작</Button>);
    const btn = screen.getByRole('button', { name: '시작' });
    expect(btn).toHaveAttribute('data-slot', 'button');
    expect(btn.className).toContain('bg-primary');

    rerender(<Button variant="destructive" size="lg">삭제</Button>);
    expect(screen.getByRole('button', { name: '삭제' }).className).toContain('bg-destructive');

    rerender(
      <Button variant="ghost" size="icon" aria-label="닫기">
        ×
      </Button>,
    );
    const icon = screen.getByRole('button', { name: '닫기' });
    expect(icon.className).toContain('min-w-[44px]');
    expect(icon).toHaveAttribute('data-slot', 'button');

    rerender(
      <Button disabled pending>
        저장
      </Button>,
    );
    const pending = screen.getByRole('button', { name: '저장' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(pending.querySelector('[data-slot="spinner"]')).not.toBeNull();
  });

  it('Button asChild: Slot으로 자식에 병합 렌더링', () => {
    render(
      <Button asChild variant="outline" size="sm">
        <a href="/study/new">학습 시작</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: '학습 시작' });
    expect(link).toHaveAttribute('href', '/study/new');
    expect(link).toHaveAttribute('data-slot', 'button');
  });

  it('Pagination: 0건 숨김, 여러 페이지 표시, 이전/다음 disabled', () => {
    const { container } = render(<Pagination total={0} page={1} pageSize={20} />);
    expect(container.firstChild).toBeNull();

    const onChange = vi.fn();
    render(<Pagination total={45} page={1} pageSize={20} onPageChange={onChange} />);
    expect(screen.getByText('총 45건')).toBeInTheDocument();
    expect(screen.getByText('현재 1 / 전체 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('Pagination: 마지막 페이지에서 다음 disabled', () => {
    render(<Pagination total={40} page={2} pageSize={20} />);
    expect(screen.getByText('현재 2 / 전체 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전' })).not.toBeDisabled();
  });

  it('Alert: role=alert, Skeleton: aria-hidden', () => {
    render(<Alert variant="error" title="오류">다시 시도해 주세요.</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('다시 시도');
    render(<Alert variant="warning">주의</Alert>);
    render(<Alert variant="info">안내</Alert>);
    expect(screen.getAllByRole('alert')).toHaveLength(3);

    const { container } = render(<Skeleton className="h-4 w-24" />);
    const sk = container.querySelector('[data-slot="skeleton"]');
    expect(sk).toHaveAttribute('aria-hidden', 'true');
  });

  it('ConfirmDialog: 열기/취소/확인 + destructive', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        open={false}
        title="포기할까요?"
        description="포기한 세트는 채점되지 않습니다."
        confirmLabel="포기 확인"
        cancelLabel="취소"
        destructive
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    rerender(
      <ConfirmDialog
        open
        title="포기할까요?"
        description="포기한 세트는 채점되지 않습니다."
        confirmLabel="포기 확인"
        cancelLabel="취소"
        destructive
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('포기할까요?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '포기 확인' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onOpenChange).toHaveBeenCalled();
  });
});
