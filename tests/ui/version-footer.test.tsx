// 앱 버전·빌드 일자 푸터 — 표기 형식·중앙 정렬·저대비 색(토큰) 검증.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { copy } from '../../src/ui/copy';
import { VersionFooter } from '../../src/ui/VersionFooter';

function setBuildGlobals(version: string, buildDate: string): void {
  const g = globalThis as unknown as { __APP_VERSION__: string; __BUILD_DATE__: string };
  g.__APP_VERSION__ = version;
  g.__BUILD_DATE__ = buildDate;
}

describe('앱 버전 푸터', () => {
  it('v{버전} ({빌드일자}) 형식으로 표시한다', () => {
    setBuildGlobals('0.2.4', '2026-10-22');
    render(<VersionFooter />);
    expect(screen.getByText('v0.2.4 (2026-10-22)')).toBeInTheDocument();
    expect(copy.version.footer('1.2.3', '26-01-02')).toBe('v1.2.3 (26-01-02)');
  });

  it('중앙 정렬 + 저대비 토큰 색(text-muted-foreground)을 쓴다', () => {
    setBuildGlobals('0.2.4', '2026-10-22');
    const { container } = render(<VersionFooter />);
    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(footer?.className).toContain('text-center');
    expect(footer?.className).toContain('text-muted-foreground');
    expect(footer?.className).toContain('moi-version-footer');
  });
});
