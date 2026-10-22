import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../src/ui/copy';
import { ROUTE_FALLBACK_DELAY_MS, RouteFallback } from '../../src/ui/RouteFallback';

function skeleton(container: HTMLElement): Element | null {
  return container.querySelector('[data-slot="skeleton"]');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RouteFallback 지연 스켈레톤 (#184)', () => {
  it('150ms 전에는 스켈레톤 없이 sr-only 로딩 문구와 aria-busy만 유지한다', () => {
    vi.useFakeTimers();
    const { container } = render(<RouteFallback />);

    expect(skeleton(container)).toBeNull();
    expect(screen.getByText(copy.common.loading)).toHaveClass('moi-sr-only');

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute('aria-busy', 'true');
    expect(wrapper).toHaveAttribute('aria-live', 'polite');

    act(() => {
      vi.advanceTimersByTime(ROUTE_FALLBACK_DELAY_MS - 1);
    });
    expect(skeleton(container)).toBeNull();
  });

  it('150ms 후 스켈레톤을 표시하고 로딩 문구는 계속 sr-only로 유지한다', () => {
    vi.useFakeTimers();
    const { container } = render(<RouteFallback />);

    act(() => {
      vi.advanceTimersByTime(ROUTE_FALLBACK_DELAY_MS);
    });

    expect(skeleton(container)).not.toBeNull();
    expect(screen.getByText(copy.common.loading)).toHaveClass('moi-sr-only');
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it.each(['page', 'form', 'detail'] as const)('%s variant에 맞는 스켈레톤을 그린다', (variant) => {
    vi.useFakeTimers();
    const { container } = render(<RouteFallback variant={variant} />);

    act(() => {
      vi.advanceTimersByTime(ROUTE_FALLBACK_DELAY_MS);
    });

    expect(skeleton(container)).toHaveAttribute('data-variant', variant);
    expect(skeleton(container)).toHaveAttribute('aria-hidden', 'true');
  });
});
