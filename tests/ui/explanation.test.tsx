import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Explanation } from '../../src/ui/study/Explanation';
import { copy } from '../../src/ui/copy';
import { typography } from '../../src/ui/tokens';
import { PELE_RENDER_TIMEOUT_MS } from '../../src/ui/study/diagram-pele';

vi.mock('pele/lazy', () => ({
  renderAsync: vi.fn(),
}));

async function peleMock() {
  const mod = await import('pele/lazy');
  return vi.mocked(mod.renderAsync);
}

function safeSvg(idPrefix = 'pele-test'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pele"><g><rect width="10" height="10"/></g><title id="${idPrefix}-title">t</title></svg>`;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Explanation Markdown', () => {
  it('강조·목록·인라인 코드·GFM 표를 렌더한다', () => {
    const md = '**강조**\n\n- 항목1\n- 항목2\n\n`인라인` 코드\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const { container } = render(<Explanation markdown={md} />);
    const strong = screen.getByText('강조');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.getByText('항목1').tagName).toBe('LI');
    const inline = screen.getByText('인라인');
    expect(inline.tagName).toBe('CODE');
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('th')).not.toBeNull();
  });

  it('원시 script를 HTML로 주입하지 않는다', () => {
    const { container } = render(<Explanation markdown={'<script>alert(1)</script>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent ?? '').toContain('alert(1)');
  });

  it('외부 링크에 target·rel을 적용한다', () => {
    render(<Explanation markdown={'[문서](https://example.com/a)'} />);
    const link = screen.getByRole('link', { name: '문서' });
    expect(link).toHaveAttribute('href', 'https://example.com/a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});

describe('Explanation Pele', () => {
  it('로딩 상태를 먼저 보인다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockImplementation(() => new Promise(() => {}));
    render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    expect(await screen.findByRole('status')).toHaveTextContent(copy.study.diagramLoading);
  });

  it('유효한 도식을 SVG로 렌더한다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockResolvedValue({ svg: safeSvg(), type: 'flowchart' } as never);
    render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    await waitFor(() => expect(box.querySelector('svg')).not.toBeNull());
    expect(box).toHaveAttribute('role', 'img');
    expect(box).toHaveAttribute('aria-label', copy.study.diagramLabel);
  });

  it('무효한 문법은 원문 폴백과 오류 안내를 보인다', async () => {
    const renderAsync = await peleMock();
    const err = new Error('syntax error');
    (err as { code?: string }).code = 'syntax';
    renderAsync.mockRejectedValue(err);
    render(<Explanation markdown={'```mermaid\nflowchart LR\n :::\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    await waitFor(() => expect(box.querySelector('pre')).not.toBeNull());
    expect(box.querySelector('code')).not.toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.study.diagramError);
  });

  it('미지원 도식은 원문 폴백을 보인다', async () => {
    const renderAsync = await peleMock();
    const err = new Error('No diagram type detected for the given text.');
    (err as { code?: string }).code = 'unsupported-diagram';
    renderAsync.mockRejectedValue(err);
    render(<Explanation markdown={'```mermaid\nhello world\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    await waitFor(() => expect(box.querySelector('pre')).not.toBeNull());
    expect(box.textContent ?? '').toContain('hello world');
  });

  it('정해진 timeout을 초과하면 폴백한다', async () => {
    expect(PELE_RENDER_TIMEOUT_MS).toBe(8000);
    const renderAsync = await peleMock();
    renderAsync.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
      const box = screen.getByTestId('mermaid-diagram');
      expect(box.querySelector('svg')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PELE_RENDER_TIMEOUT_MS + 100);
      });
      expect(box.querySelector('pre')).not.toBeNull();
      expect(screen.getByRole('alert')).toHaveTextContent(copy.study.diagramError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('언마운트 후에는 상태를 갱신하지 않는다', async () => {
    const renderAsync = await peleMock();
    let resolve!: (v: { svg: string; type: string }) => void;
    renderAsync.mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res as (v: { svg: string; type: string }) => void;
        }),
    );
    const { unmount } = render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    unmount();
    resolve({ svg: safeSvg(), type: 'flowchart' });
    await Promise.resolve();
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();
  });

  it('code 변경 경합에서 마지막 코드만 반영한다', async () => {
    const renderAsync = await peleMock();
    const first = { svg: safeSvg('first'), type: 'flowchart' };
    const second = { svg: safeSvg('second'), type: 'flowchart' };
    renderAsync
      .mockImplementationOnce(() => new Promise((res) => setTimeout(() => res(first as never), 30)))
      .mockImplementationOnce(() => Promise.resolve(second as never));
    const { rerender } = render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    rerender(<Explanation markdown={'```mermaid\nsequenceDiagram\n A->>B: hi\n```'} />);
    const boxes = await screen.findAllByTestId('mermaid-diagram');
    await waitFor(() => expect(boxes[0].querySelector('svg')).not.toBeNull(), { timeout: 2000 });
  });

  it('2개 이상 도식의 idPrefix가 격리된다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockImplementation((async (_code: string, opts?: unknown) => ({
      svg: safeSvg((opts as { idPrefix?: string } | undefined)?.idPrefix ?? 'pele-test'),
      type: 'flowchart',
    })) as never);
    render(
      <div>
        <Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />
        <Explanation markdown={'```mermaid\nflowchart LR\n C-->D\n```'} />
      </div>,
    );
    const boxes = await screen.findAllByTestId('mermaid-diagram');
    await waitFor(() => expect(boxes).toHaveLength(2));
    await waitFor(() => {
      expect(renderAsync).toHaveBeenCalledTimes(2);
    });
    const firstPrefix = vi.mocked(renderAsync).mock.calls[0][1] as { idPrefix: string };
    const secondPrefix = vi.mocked(renderAsync).mock.calls[1][1] as { idPrefix: string };
    expect(firstPrefix.idPrefix).not.toBe(secondPrefix.idPrefix);
  });

  it('accTitle·accDescr를 SVG title·desc로 전달한다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockImplementation((async (_code: string, opts?: unknown) => {
      const prefix = ((opts as { idPrefix?: string } | undefined)?.idPrefix ?? 'pele-test');
      return {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" class="pele"><title id="${prefix}-title">My Title</title><desc id="${prefix}-desc">My desc</desc><g><rect width="10" height="10"/></g></svg>`,
        type: 'flowchart',
      } as never;
    }) as never);
    render(<Explanation markdown={'```mermaid\nflowchart LR\n accTitle: My Title\n accDescr: My desc\n A-->B\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    await waitFor(() => expect(box.querySelector('svg')).not.toBeNull());
    expect(box.querySelector('title')?.textContent).toBe('My Title');
    expect(box.querySelector('desc')?.textContent).toBe('My desc');
  });

  it('스크린리더 계약을 유지한다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockResolvedValue({ svg: safeSvg(), type: 'flowchart' } as never);
    render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    expect(box).toHaveAttribute('role', 'img');
    expect(box).toHaveAttribute('aria-label', copy.study.diagramLabel);
    await waitFor(() => expect(box.querySelector('svg')).not.toBeNull());
  });

  it('오류 안내를 사용자에게 보인다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockRejectedValue(new Error('bad'));
    render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(copy.study.diagramError);
  });

  it('위험 SVG는 원문 폴백한다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      type: 'flowchart',
    } as never);
    render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    await waitFor(() => expect(box.querySelector('pre')).not.toBeNull());
    expect(box.querySelector('script')).toBeNull();
  });

  it('외부 URL 위험 SVG는 폴백한다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><g><a href="javascript:alert(1)"><text>hi</text></a></g></svg>',
      type: 'flowchart',
    } as never);
    render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    await waitFor(() => expect(box.querySelector('pre')).not.toBeNull());
  });

  it('container 폭과 폰트를 render 옵션으로 전달한다', async () => {
    const renderAsync = await peleMock();
    renderAsync.mockResolvedValue({ svg: safeSvg(), type: 'flowchart' } as never);
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
    try {
      render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
      await waitFor(() => expect(renderAsync).toHaveBeenCalled());
      const opts = vi.mocked(renderAsync).mock.calls[0][1] as {
        maxWidth?: number;
        fontFamily?: string;
      };
      expect(opts.maxWidth).toBe(320);
      expect(opts.fontFamily).toBe(typography.fontUi);
    } finally {
      widthSpy.mockRestore();
    }
  });
});
