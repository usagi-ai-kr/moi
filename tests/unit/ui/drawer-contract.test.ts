// #215 — Drawer·반응형 CSS 계약 정적 검사 (ADR-0057).
// 터치 타깃 44px·breakpoint 767px·dvh·reduced-motion·overflow-x 은폐 금지·z-index 계약을 검증한다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cssVars } from '@/ui/tokens';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const drawerCss = read('src/ui/drawer.css');
const shellCss = read('src/ui/shell.css');
const stylesCss = read('src/ui/styles.css');
const responsiveTs = read('src/ui/responsive.ts');

const TOUCH_MIN = cssVars['--moi-touch-min'];
const DRAWER_MAX = cssVars['--moi-drawer-w-max'];
const DRAWER_GAP = cssVars['--moi-drawer-gap'];

describe('Drawer 터치 타깃 — 44×44px 계약 (DESIGN.md 5항)', () => {
  it('트리거·닫기·메뉴 항목이 최소 44px를 보장한다', () => {
    expect(TOUCH_MIN).toBe('44px');
    for (const selector of ['.moi-drawer-trigger', '.moi-drawer-close', '.moi-drawer-link']) {
      const block = drawerCss.slice(drawerCss.indexOf(`${selector} {`));
      expect(block, `${selector} 블록 없음`).toContain(selector);
      const rule = block.slice(0, block.indexOf('}'));
      expect(rule, `${selector} min-height`).toContain('min-height: var(--moi-touch-min)');
      if (selector !== '.moi-drawer-link') {
        expect(rule, `${selector} min-width`).toContain('min-width: var(--moi-touch-min)');
      }
    }
  });

  it('브랜드 링크도 44px 터치 타깃을 갖는다', () => {
    expect(shellCss).toMatch(/\.moi-brand-link \{[^}]*min-width: var\(--moi-touch-min\)/);
  });
});

describe('Drawer 지오메트리·안전영역·높이 계약', () => {
  it('폭은 320px 뷰포트에서 뷰포트를 넘지 않는다', () => {
    expect(DRAWER_MAX).toBe('320px');
    expect(DRAWER_GAP).toBe('48px');
    expect(drawerCss).toContain('width: min(var(--moi-drawer-w-max), calc(100vw - var(--moi-drawer-gap)))');
    expect(drawerCss).toContain('max-width: 100%');
    // 320 - 48 = 272px — 백드롭 클릭 영역이 남는다.
    expect(320 - Number.parseInt(DRAWER_GAP, 10)).toBe(272);
  });

  it('높이는 100dvh(100vh 폴백)·safe-area·내부 스크롤을 사용한다', () => {
    expect(drawerCss).toMatch(/height: 100vh;\s*\n\s*height: 100dvh;/);
    expect(drawerCss).toContain('padding-right: env(safe-area-inset-right, 0px)');
    expect(drawerCss).toContain('padding-bottom: env(safe-area-inset-bottom, 0px)');
    expect(drawerCss).toContain('overflow-y: auto');
    expect(drawerCss).toContain('overscroll-behavior: contain');
  });

  it('헤더(z-index 10)보다 위에 그려진다', () => {
    const drawerZ = Number.parseInt(drawerCss.match(/z-index: (\d+)/)?.[1] ?? '0', 10);
    const headerZ = Number.parseInt(shellCss.match(/z-index: (\d+)/)?.[1] ?? '0', 10);
    expect(drawerZ).toBeGreaterThan(headerZ);
  });
});

describe('반응형 계약 — breakpoint·모션·overflow 은폐 금지', () => {
  it('모바일 구간은 767px 이하이고 태블릿은 768px부터 가로 nav다', () => {
    expect(responsiveTs).toContain('(max-width: ${breakpoints.tablet - 1}px)');
    expect(shellCss).toContain('@media (min-width: 768px)');
  });

  it('가로 nav는 hidden 처리로 포커스·AT 중복을 막는다', () => {
    expect(shellCss).toMatch(/\.moi-nav\[hidden\] \{\s*\n\s*display: none;/);
  });

  it('Drawer 전환은 prefers-reduced-motion: no-preference 안에서만 실행한다', () => {
    const reduced = drawerCss.match(/@media \(prefers-reduced-motion: no-preference\)/g) ?? [];
    expect(reduced.length).toBeGreaterThan(0);
    const animationIndex = drawerCss.indexOf('animation: moi-drawer-in');
    const mediaIndex = drawerCss.lastIndexOf('@media (prefers-reduced-motion: no-preference)');
    expect(animationIndex).toBeGreaterThan(mediaIndex);
  });

  it('overflow-x: hidden으로 결함을 은폐하지 않는다', () => {
    for (const [name, css] of [
      ['drawer.css', drawerCss],
      ['shell.css', shellCss],
      ['styles.css', stylesCss],
    ] as const) {
      expect(css, `${name}에 overflow-x: hidden 있음`).not.toMatch(/overflow-x\s*:\s*hidden/);
    }
  });

  it('셸 헤더 높이 토큰과 실측(61px)이 일치한다', () => {
    expect(cssVars['--moi-shell-header-h']).toBe('61px');
    expect(shellCss).toContain('min-height: var(--moi-shell-header-h)');
    expect(shellCss).toMatch(/min-height: calc\(100dvh - var\(--moi-shell-header-h\)\)/);
  });
});
