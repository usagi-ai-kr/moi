// #244 — 로그인 전후 화면 시각 통일성 계약.
// 랜딩(로그아웃 첫 화면)은 셸과 같은 읽기 열(≥1024 720)·.moi-page 리듬(h1→다음 24·리드→CTA 36)·
// 좌우 기준선(컨테이너·제목·CTA left)을 공유한다. 전역 .moi-container(960) 변경 금지.
// 기능 차이(nav/selector 유무, Kakao 46px/360px, accent 랜딩 전용)는 유지한다.
// 실제 Chromium 레이아웃으로 bbox를 검증한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { cssVars, kakao, layout } from '@/ui/tokens';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const STYLES = readFileSync(path.join(REPO_ROOT, 'src/ui/styles.css'), 'utf8');
const SHELL = readFileSync(path.join(REPO_ROOT, 'src/ui/shell.css'), 'utf8');
const ROOT_VARS = `:root { ${Object.entries(cssVars)
  .map(([name, value]) => `${name}: ${value};`)
  .join(' ')} }`;
const CSS = `${ROOT_VARS}\n${STYLES}\n${SHELL}`;

const OUT = `<header class="moi-header"><div class="moi-container moi-header-inner moi-landing-head"><span>moi</span></div></header><main class="moi-main"><div class="moi-container moi-main-inner moi-landing"><div class="moi-page moi-landing-page"><div class="moi-accent"></div><h1 class="moi-title">moi</h1><p class="moi-lead">tagline</p><div class="moi-cta"><a class="moi-kakao-login" href="/auth/kakao">kakao</a></div></div></div></main>`;
const IN = `<header class="moi-header moi-shell-header"><div class="moi-container moi-shell-head"><span>moi</span></div></header><main class="moi-main moi-shell-main"><div class="moi-container moi-main-inner"><div class="moi-page"><h1 class="moi-title">greeting</h1><section><p class="moi-note">note</p></section><div class="moi-cta moi-study-cta-row"><button class="moi-study-open">cta</button></div></div></div></main>`;

async function measure(browser: Browser, markup: string, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.setContent(`<style>${CSS}</style>${markup}`);
  const d = await page.evaluate(() => {
    const cont = document.querySelector('.moi-main-inner')!;
    const head = document.querySelector('.moi-header > div')!;
    const h1 = document.querySelector('h1.moi-title')!;
    const cta = document.querySelector('.moi-cta')!;
    const btn = cta.firstElementChild!;
    const r = (el: Element) => el.getBoundingClientRect();
    return {
      contL: Math.round(r(cont).left * 10) / 10,
      contW: Math.round(r(cont).width * 10) / 10,
      headL: Math.round(r(head).left * 10) / 10,
      headW: Math.round(r(head).width * 10) / 10,
      h1L: Math.round(r(h1).left * 10) / 10,
      h1gap: Math.round((r(h1.nextElementSibling!).top - r(h1).bottom) * 10) / 10,
      ctaL: Math.round(r(cta).left * 10) / 10,
      btnL: Math.round(r(btn).left * 10) / 10,
      btnH: Math.round(r(btn).height * 10) / 10,
      btnW: Math.round(r(btn).width * 10) / 10,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await context.close();
  return d;
}

describe('#244 로그인 전후 시각 통일성 계약', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('토큰: 컨테이너 960 유지·읽기 열 720·Kakao 46/360 예외 유지', () => {
    expect(layout.containerMaxWidth).toBe(960);
    expect(layout.readingMaxWidth).toBe(720);
    expect(cssVars['--moi-container-max']).toBe('960px');
    expect(cssVars['--moi-reading-max']).toBe('720px');
    expect(kakao.height).toBe(46);
    expect(kakao.maxWidth).toBe(360);
  });

  it('CSS 원문: 랜딩 스코프만 reading-max를 사용하고 전역 .moi-container는 960 그대로다', () => {
    expect(STYLES).toContain('.moi-landing-head, .moi-landing');
    expect(STYLES).toContain('max-width: var(--moi-reading-max)');
    const contBlock = STYLES.match(/\.moi-container\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(contBlock).toContain('max-width: var(--moi-container-max)');
    expect(contBlock).not.toContain('720');
    expect(STYLES).toContain('.moi-landing-page > .moi-accent');
    expect(STYLES).toContain('margin-bottom: var(--moi-space-3)');
  });

  it.each([320, 375, 768, 1024, 1280])('%ipx: 컨테이너·헤더·제목·CTA 좌우 기준선이 일치한다', async (w) => {
    const o = await measure(browser, OUT, w);
    const i = await measure(browser, IN, w);
    expect(o.contL).toBe(i.contL);
    expect(o.contW).toBe(i.contW);
    expect(o.headL).toBe(i.headL);
    expect(o.headW).toBe(i.headW);
    expect(o.h1L).toBe(i.h1L);
    expect(o.ctaL).toBe(i.ctaL);
    expect(o.btnL).toBe(i.btnL);
    expect(o.overflow).toBe(0);
    expect(i.overflow).toBe(0);
  }, 30_000);

  it('≥1024 읽기 열 720 · <1024 기존 셸 규칙과 동일 폭이다', async () => {
    for (const w of [1024, 1280]) {
      const o = await measure(browser, OUT, w);
      expect(o.contW).toBe(720);
    }
    const o320 = await measure(browser, OUT, 320);
    const i320 = await measure(browser, IN, 320);
    expect(o320.contW).toBe(320);
    expect(i320.contW).toBe(320);
  }, 30_000);

  it('수직 리듬: h1→다음 24px가 전후 동일하고 Kakao 높이 예외를 유지한다', async () => {
    const o = await measure(browser, OUT, 1280);
    const i = await measure(browser, IN, 1280);
    expect(o.h1gap).toBe(24);
    expect(i.h1gap).toBe(24);
    expect(o.btnH).toBe(46);
    expect(o.btnW).toBeLessThanOrEqual(360);
  }, 30_000);
});
