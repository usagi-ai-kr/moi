import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Explanation } from '../../src/ui/study/Explanation';
import { copy } from '../../src/ui/copy';

vi.mock('pele/lazy', () => ({
  renderAsync: vi.fn(),
}));

async function peleMock() {
  const mod = await import('pele/lazy');
  return vi.mocked(mod.renderAsync);
}

function safeSvg(idPrefix = 'pele-ann'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pele"><g><rect width="10" height="10"/></g><title id="${idPrefix}-title">t</title></svg>`;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// #179 AT 로딩/오류 비차단 후속: role=img 하위 status/alert는 AT에서 감춰질 수 있다.
describe('MermaidDiagram AT 안내 (#179)', () => {
  it('로딩 status가 img 후손이 아니고 AT에 노출된다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockImplementation(() => new Promise(() => {}));
    render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(copy.study.diagramLoading);
    expect(status.closest('[role="img"]')).toBeNull();
  });

  it('실패 alert와 원문 코드가 인지가능하고 img 후손이 아니다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockRejectedValue(new Error('bad'));
    render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.study.diagramError);
    expect(alert.closest('[role="img"]')).toBeNull();
    const box = screen.getByTestId('mermaid-diagram');
    expect(box.getAttribute('role')).not.toBe('img');
    const code = box.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code?.closest('[role="img"]')).toBeNull();
    expect(code?.textContent ?? '').toContain('A-->B');
  });

  it('성공 도식은 accessible name·안전 SVG를 유지하고 중복 live·영구 busy가 없다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockResolvedValue({ svg: safeSvg(), type: 'flowchart' } as never);
    const { container } = render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    await waitFor(() => expect(box.querySelector('svg')).not.toBeNull());
    expect(box).toHaveAttribute('role', 'img');
    expect(box).toHaveAttribute('aria-label', copy.study.diagramLabel);
    expect(box.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(box.getAttribute('aria-busy')).toBeNull();
    expect(box.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('폭 변경 경합에서 stale 렌더가 최신 결과를 덮어쓰지 않는다', async () => {
    const renderAsync = await peleMock();
    let resolveFirst!: (v: { svg: string; type: string }) => void;
    renderAsync.mockImplementation(() => Promise.resolve({ svg: safeSvg('second'), type: 'flowchart' } as never));
    renderAsync.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFirst = res as (v: { svg: string; type: string }) => void;
        }),
    );
    // code 변경은 react-markdown 리마운트로 live 가드가 실행되지 않으므로,
    // 동일 인스턴스 effect가 재실행되는 유일한 폭 변경 경로를 재현한다.
    let roUpdate: (() => void) | null = null;
    const OrigRO = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
    class FakeRO {
      constructor(cb: () => void) {
        roUpdate = cb;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeRO;
    let currentWidth = 0;
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => currentWidth);
    try {
      render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
      await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(1));
      currentWidth = 640;
      await act(async () => {
        roUpdate?.();
      });
      await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(2));
      const box = await screen.findByTestId('mermaid-diagram');
      await waitFor(() => expect(box.innerHTML).toContain('second-title'), { timeout: 2000 });
      await act(async () => {
        resolveFirst({ svg: safeSvg('first'), type: 'flowchart' });
        await Promise.resolve();
      });
      await waitFor(() => expect(box.querySelector('svg')).not.toBeNull());
      expect(box.innerHTML).toContain('second-title');
      expect(box.innerHTML).not.toContain('first-title');
      const secondOpts = vi.mocked(renderAsync).mock.calls[1][1] as { maxWidth?: number };
      expect(secondOpts.maxWidth).toBe(640);
    } finally {
      widthSpy.mockRestore();
      if (OrigRO === undefined) delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
      else (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = OrigRO;
    }
  });
});
