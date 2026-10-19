import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Explanation } from '../../src/ui/study/Explanation';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

async function mermaidMock() {
  const mod = await import('mermaid');
  return vi.mocked((mod.default as { render: unknown }).render as ReturnType<typeof vi.fn>);
}

beforeEach(() => {
  vi.restoreAllMocks();
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

describe('Explanation Mermaid', () => {
  it('mermaid 블록을 SVG로 렌더한다', async () => {
    const renderMock = await mermaidMock();
    renderMock.mockResolvedValue('<svg>diagram</svg>' as unknown as { svg: string });
    render(<Explanation markdown={'```mermaid\nflowchart LR\n A-->B\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    await waitFor(() => expect(box.querySelector('svg')).not.toBeNull());
    expect(box).toHaveAttribute('role', 'img');
    expect(box).toHaveAttribute('aria-label', '다이어그램');
  });

  it('mermaid 실패 시 코드 폴백을 보인다', async () => {
    const renderMock = await mermaidMock();
    renderMock.mockRejectedValueOnce(new Error('bad'));
    render(<Explanation markdown={'```mermaid\ngraph TD\n```'} />);
    const box = await screen.findByTestId('mermaid-diagram');
    await waitFor(() => expect(box.querySelector('pre')).not.toBeNull());
    expect(box.querySelector('code')).not.toBeNull();
  });
});
