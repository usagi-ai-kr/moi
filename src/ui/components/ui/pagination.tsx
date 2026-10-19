import * as React from 'react';
import { cn } from '@/ui/lib/utils';

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  total: number;
  page: number;
  pageSize: number;
  onPageChange?: (page: number) => void;
  disabled?: boolean;
}

function Pagination({ total, page, pageSize, onPageChange, disabled = false, className, ...props }: PaginationProps) {
  if (total <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));

  if (totalPages <= 1) {
    return (
      <nav data-slot="pagination" aria-label="페이지네이션" className={cn('flex items-center gap-2', className)} {...props}>
        <span data-slot="pagination-total" className="text-sm text-muted-foreground">
          총 {total}건
        </span>
      </nav>
    );
  }

  const prevDisabled = disabled || page <= 1;
  const nextDisabled = disabled || page >= totalPages;
  const btn =
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  return (
    <nav
      data-slot="pagination"
      aria-label="페이지네이션"
      aria-busy={disabled ? 'true' : undefined}
      className={cn('flex items-center gap-2', className)}
      {...props}
    >
      <span data-slot="pagination-total" className="text-sm text-muted-foreground">
        총 {total}건
      </span>
      <span data-slot="pagination-page" aria-live="polite" className="text-sm">
        현재 {page} / 전체 {totalPages}
      </span>
      <button
        type="button"
        data-slot="pagination-prev"
        aria-label="이전"
        className={btn}
        disabled={prevDisabled}
        onClick={() => onPageChange?.(page - 1)}
      >
        이전
      </button>
      <button
        type="button"
        data-slot="pagination-next"
        aria-label="다음"
        className={btn}
        disabled={nextDisabled}
        onClick={() => onPageChange?.(page + 1)}
      >
        다음
      </button>
    </nav>
  );
}

export { Pagination };
