// #238 — 헤더-본문 상단 간격 space-6(32px) 계약.
// 첫 화면(.moi-main)과 로그인 셸(.moi-shell-main) 모두 같은 토큰을 사용한다.
// 실제 Chromium 레이아웃으로 padding-top 계산값과 header.bottom→첫 콘텐츠 gap을 검증한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { cssVars, space } from '@/ui/tokens';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const STYLES = readFileSync(path.join(REPO_ROOT, 'src/ui/styles.css'), 'utf8');
const SHELL = readFileSync(path.join(REPO_ROOT, 'src/ui/shell.css'), 'utf8');
const ROOT_VARS = `:root { ${Object.entries(cssVars)
  .map(([name, value]) => `${name}: ${value};`)
  .join(' ')} }`;
const CSS = `${ROOT_VARS}\n${STYLES}\n${SHELL}`;
const EXPECTED = `${space['6']}px`; // 32px

const HOME_MARKUP = `
  <header class="moi-header"><div class="moi-container moi-header-inner"><span>moi</span></div></header>
  <main class="moi-main"><div class="moi-container moi-main-inner"><div class="moi-accent"></div><h1>t</h1></div></main>`;
const SHELL_MARKUP = `
  <header class="moi-header moi-shell-header"><div class="moi-container moi-shell-head"><span>moi</span></div></header>
  <main class="moi-main moi-shell-main"><div class="moi-container moi-main-inner"><div class="moi-page"><h1>t</h1></div></div></main>`;

async function layout(browser: Browser, markup: string, mainSel: string, headerSel: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.setContent(`<style>${CSS}</style>${markup}`);
  const d = await page.evaluate(
    ({ mainSel, headerSel }) => {
      const header = document.querySelector(headerSel)!;
      const main = document.querySelector(mainSel)!;
      const first = main.querySelector('.moi-main-inner')!.firstElementChild!;
      const hb = header.getBoundingClientRect();
      const fb = first.getBoundingClientRect();
      const cs = getComputedStyle(main);
      const hs = getComputedStyle(header);
      return {
        paddingTop: cs.paddingTop,
        gap: Math.round((fb.top - hb.bottom) * 10) / 10,
        headerPosition: hs.position,
      };
    },
    { mainSel, headerSel },
  );
  await context.close();
  return d;
}

describe('#238 헤더-본문 상단 간격 space-6 계약', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('CSS 원문: 두 main 모두 var(--moi-space-6)이며 하드코딩 px가 없다', () => {
    for (const [name, text, sel] of [
      ['styles.css/.moi-main', STYLES, '.moi-main'],
      ['shell.css/.moi-shell-main', SHELL, '.moi-shell-main'],
    ] as const) {
      const block = text.match(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
      expect(block, `${name} 블록 존재`).toContain('padding-top: var(--moi-space-6)');
      expect(block, `${name} 하드코딩 금지`).not.toMatch(/padding-top:\s*\d+px/);
    }
  });

  it('토큰: --moi-space-6은 32px이다', () => {
    expect(space['6']).toBe(32);
    expect(cssVars['--moi-space-6']).toBe('32px');
  });

  it('첫 화면: padding-top 32px · header→첫 콘텐츠 gap 32px · sticky 유지', async () => {
    const d = await layout(browser, HOME_MARKUP, 'main.moi-main', 'header.moi-header');
    expect(d.paddingTop).toBe(EXPECTED);
    expect(d.gap).toBe(32);
    expect(d.headerPosition).toBe('sticky');
  }, 30_000);

  it('로그인 셸: padding-top 32px · header→첫 콘텐츠 gap 32px · sticky 유지', async () => {
    const d = await layout(browser, SHELL_MARKUP, 'main.moi-shell-main', 'header.moi-shell-header');
    expect(d.paddingTop).toBe(EXPECTED);
    expect(d.gap).toBe(32);
    expect(d.headerPosition).toBe('sticky');
  }, 30_000);
});
