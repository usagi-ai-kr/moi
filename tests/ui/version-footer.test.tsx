// 앱 버전 푸터 — 버전만 표시하고 중앙 정렬·저대비 색(토큰)을 유지하는지 검증.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { copy } from '../../src/ui/copy';
import { VersionFooter } from '../../src/ui/VersionFooter';

function setBuildGlobals(version: string): void {
  const g = globalThis as unknown as { __APP_VERSION__: string };
  g.__APP_VERSION__ = version;
}

describe('앱 버전 푸터', () => {
  it('버전만 표시하고 빌드 날짜와 PR 번호는 표시하지 않는다', () => {
    setBuildGlobals('0.2.5');
    render(<VersionFooter />);
    const footer = screen.getByText('v0.2.5');
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toBe('v0.2.5');
    expect(footer.textContent).not.toMatch(/#\d+|\d{4}-\d{2}-\d{2}/);
    expect(copy.version.footer('1.2.3')).toBe('v1.2.3');
  });

  it('중앙 정렬 + 저대비 토큰 색(text-muted-foreground)을 쓴다', () => {
    setBuildGlobals('0.2.5');
    const { container } = render(<VersionFooter />);
    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(footer?.className).toContain('text-center');
    expect(footer?.className).toContain('text-muted-foreground');
    expect(footer?.className).toContain('moi-version-footer');
  });
});
