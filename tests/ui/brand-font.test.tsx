// #225 — 워드마크 Bricolage Grotesque 범위·토큰·라이선스 (RTL+정적, Red→Green).
// 한국어 본문·버튼·문항·전역 font-family 변경 금지, .moi-brand에만 적용.
import { render, screen } from '@testing-library/react';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Brand } from '../../src/ui/Brand';
import { cssVars, typography } from '../../src/ui/tokens';

describe('brand font 토큰 — Bricolage 범위 한정', () => {
  it('fontBrand는 Bricolage 우선·display 폴백·URL/파일명 계약', () => {
    expect(typography.brandFontFamily).toBe('Bricolage Grotesque');
    expect(typography.brandFontUrl).toBe('/fonts/bricolage-grotesque-moi.woff2');
    expect(typography.fontBrand.startsWith("'Bricolage Grotesque'")).toBe(true);
    expect(typography.fontBrand).toContain("'KoddiUDOngodic'");
    expect(typography.fontBrand).toContain('system-ui');
    expect(cssVars['--moi-font-brand']).toBe(typography.fontBrand);
    // 기존 토큰 불변 — 한국어 본문·UI 스택에 Bricolage 유입 금지
    expect(typography.fontUi).not.toContain('Bricolage');
    expect(typography.fontDisplay).not.toContain('Bricolage');
    expect(cssVars['--moi-font-ui']).not.toContain('Bricolage');
    expect(cssVars['--moi-font-display']).not.toContain('Bricolage');
  });

  it('brand.css는 @font-face+모i 범위·.moi-brand만 브랜드 폰트 사용', () => {
    const css = readFileSync('src/ui/brand.css', 'utf8');
    expect(css).toMatch(/@font-face/);
    expect(css).toMatch(/Bricolage Grotesque/);
    expect(css).toMatch(/bricolage-grotesque-moi\.woff2/);
    expect(css).toMatch(/font-display:\s*swap/);
    expect(css).toMatch(/unicode-range:[^;]*U\+0069[^;]*U\+006D[^;]*U\+006F/i);
    expect(css).toMatch(/\.moi-brand\s*\{[^}]*var\(--moi-font-brand\)/s);
    // 전역 선택자·body·title에 브랜드 폰트 유입 금지
    expect(css).not.toMatch(/body\s*\{[^}]*--moi-font-brand/s);
  });

  it('전역 스타일은 불변 — body는 UI 스택·title은 display 스택 유지', () => {
    const styles = readFileSync('src/ui/styles.css', 'utf8');
    expect(styles).toMatch(/body\s*\{[^}]*font-family:\s*var\(--moi-font-ui\)/s);
    expect(styles).not.toContain('--moi-font-brand');
    expect(styles).not.toContain('Bricolage');
  });

  it('self-host subset·라이선스·preload 계약', () => {
    const woff = 'public/fonts/bricolage-grotesque-moi.woff2';
    const ofl = 'public/fonts/OFL-BricolageGrotesque.txt';
    expect(existsSync(woff)).toBe(true);
    expect(existsSync(ofl)).toBe(true);
    expect(statSync(woff).size).toBeLessThan(5 * 1024);
    expect(readFileSync(woff).subarray(0, 4).toString()).toBe('wOF2');
    expect(readFileSync(ofl, 'utf8')).toMatch(/SIL OPEN FONT LICENSE/);
    expect(readFileSync(ofl, 'utf8')).toMatch(/Bricolage Grotesque Project Authors/);
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/rel="preload"[^>]*bricolage-grotesque-moi\.woff2/);
    expect(html).toMatch(/as="font"/);
  });

  it('Brand는 여전히 moi 텍스트·장식 아이콘 단일 소스', () => {
    render(<Brand />);
    expect(screen.getByText('moi')).toHaveClass('moi-brand');
    const icon = document.querySelector('img.moi-brand-icon');
    expect(icon?.getAttribute('src')).toBe('/favicon.svg');
  });
});
