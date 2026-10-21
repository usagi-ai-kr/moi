// #243 — 페이지 제목 h1 아래 24px 통일 계약.
// .moi-title/.moi-account-title: margin-bottom space-3(12) + 부모 gap 12 = 24.
// h1.moi-study-title: margin-bottom space-1(4) + 부모 gap 12 + 다음 .moi-note margin-top 8 = 24.
// h2.moi-study-title에는 적용하지 않는다. 하드코딩 px 금지(토큰만).
// 실제 Chromium 레이아웃으로 h1.bottom→다음 top bbox를 검증한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { cssVars, space } from '@/ui/tokens';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const STYLES = readFileSync(path.join(REPO_ROOT, 'src/ui/styles.css'), 'utf8');
const ACCOUNT = readFileSync(path.join(REPO_ROOT, 'src/ui/account.css'), 'utf8');
const STUDY = readFileSync(path.join(REPO_ROOT, 'src/ui/study/study.css'), 'utf8');
const ROOT_VARS = `:root { ${Object.entries(cssVars)
  .map(([name, value]) => `${name}: ${value};`)
  .join(' ')} }`;
const CSS = `${ROOT_VARS}\n${STYLES}\n${ACCOUNT}\n${STUDY}`;

const PAGE_MARKUP = `<div class="moi-page"><h1 class="moi-title">제목</h1><div>다음</div></div>`;
const ACCOUNT_MARKUP = `<section class="moi-page moi-account"><h1 class="moi-account-title">계정</h1><p class="moi-lead">안내</p></section>`;
const STUDY_H1_MARKUP = `<section class="moi-study"><h1 class="moi-study-title">시작</h1><p class="moi-note">안내</p></section>`;
const STUDY_H2_MARKUP = `<section class="moi-study"><h2 class="moi-study-title">이력</h2><p class="moi-note">안내</p></section>`;
const LOGGED_OUT_MARKUP = `<div class="moi-main-inner"><h1 class="moi-title">moi</h1><p class="moi-lead">소개</p></div>`;

function blockOf(text: string, selector: string): string {
  const esc = selector.replace('.', '\\.');
  return text.match(new RegExp(`${esc}\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
}

async function gap(browser: Browser, markup: string, h1Sel: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.setContent(`<style>${CSS}</style>${markup}`);
  const d = await page.evaluate((sel) => {
    const h1 = document.querySelector(sel)!;
    const r = h1.getBoundingClientRect();
    const next = h1.nextElementSibling!;
    const nr = next.getBoundingClientRect();
    return {
      gap: Math.round((nr.top - r.bottom) * 10) / 10,
      marginBottom: getComputedStyle(h1).marginBottom,
    };
  }, h1Sel);
  await context.close();
  return d;
}

describe('#243 페이지 제목-하단 24px 계약', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('CSS 원문: .moi-title은 var(--moi-space-3)이며 하드코딩 px가 없다', () => {
    const block = blockOf(STYLES, '.moi-title');
    expect(block, '.moi-title 블록 존재').toContain('margin-bottom: var(--moi-space-3)');
    expect(block, '.moi-title 하드코딩 금지').not.toMatch(/margin-bottom:\s*\d+px/);
  });

  it('CSS 원문: .moi-account-title는 var(--moi-space-3)이며 하드코딩 px가 없다', () => {
    const block = blockOf(ACCOUNT, '.moi-account-title');
    expect(block, '.moi-account-title 블록 존재').toContain('margin-bottom: var(--moi-space-3)');
    expect(block, '.moi-account-title 하드코딩 금지').not.toMatch(/margin-bottom:\s*\d+px/);
  });

  it('CSS 원문: h1.moi-study-title만 var(--moi-space-1), h2·공통 블록에는 margin-bottom이 없다', () => {
    const h1 = STUDY.match(/h1\.moi-study-title\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(h1, 'h1.moi-study-title 블록 존재').toContain('margin-bottom: var(--moi-space-1)');
    expect(h1, 'h1 하드코딩 금지').not.toMatch(/margin-bottom:\s*\d+px/);
    expect(blockOf(STUDY, '.moi-study-title'), '공통 블록 margin-bottom 없음').not.toContain('margin-bottom');
    expect(STUDY, 'h2 전용 margin-bottom 금지').not.toMatch(/h2\.moi-study-title/);
  });

  it('토큰: space-3=12·space-1=4 — 합산 24 (12+12 / 12+4+8)', () => {
    expect(space['3']).toBe(12);
    expect(space['1']).toBe(4);
    expect(space['2']).toBe(8);
    expect(cssVars['--moi-space-3']).toBe('12px');
    expect(cssVars['--moi-space-1']).toBe('4px');
  });

  it('실브라우저: .moi-page h1 → 다음 24px', async () => {
    const d = await gap(browser, PAGE_MARKUP, 'h1.moi-title');
    expect(d.marginBottom).toBe('12px');
    expect(d.gap).toBe(24);
  }, 30_000);

  it('실브라우저: 계정 h1 → 다음 24px', async () => {
    const d = await gap(browser, ACCOUNT_MARKUP, 'h1.moi-account-title');
    expect(d.marginBottom).toBe('12px');
    expect(d.gap).toBe(24);
  }, 30_000);

  it('실브라우저: 학습 h1 → .moi-note 24px, h2 → 20px(변경 없음)', async () => {
    const h1 = await gap(browser, STUDY_H1_MARKUP, 'h1.moi-study-title');
    expect(h1.marginBottom).toBe('4px');
    expect(h1.gap).toBe(24);
    const h2 = await gap(browser, STUDY_H2_MARKUP, 'h2.moi-study-title');
    expect(h2.marginBottom).toBe('0px');
    expect(h2.gap).toBe(20);
  }, 30_000);

  it('실브라우저: 로그아웃 첫 화면(.moi-main-inner gap 8) h1 → 다음 20px — 구조상 예외 기록', async () => {
    const d = await gap(browser, LOGGED_OUT_MARKUP, 'h1.moi-title');
    expect(d.marginBottom).toBe('12px');
    expect(d.gap).toBe(20);
  }, 30_000);
});
