// #260 — 결과 상세 카드 ↔ 페이저 이동(이전/다음) 간격 space-5(24px) 계약.
// 실제 Chromium 레이아웃으로 간격 계산값과 5폭(320/375/768/1024/1280) 가로 오버플로 0을 검증한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { cssVars, space } from '@/ui/tokens';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const STYLES = read('src/ui/styles.css');
const WIDGETS = read('src/ui/widgets.css');
const STUDY = read('src/ui/study/study.css');
const RESULT = read('src/ui/study/study-result.css');
const ROOT_VARS = `:root { ${Object.entries(cssVars)
  .map(([name, value]) => `${name}: ${value};`)
  .join(' ')} }`;
const CSS = `${ROOT_VARS}\n${STYLES}\n${WIDGETS}\n${STUDY}\n${RESULT}`;
const WIDTHS = [320, 375, 768, 1024, 1280];

// 실제 ResultPager DOM 순서 — 진행 표시 → 상세 카드(ol>li) → 이동 영역(nav).
const MARKUP = `
  <div class="moi-study">
    <div class="moi-study-pager">
      <p class="moi-study-pager-status">1/10</p>
      <ol class="moi-study-peritem">
        <li>
          <dl class="moi-study-meta">
            <div><dt>문항</dt><dd>1</dd></div>
            <div><dt>채점</dt><dd>정답</dd></div>
            <div><dt>응답</dt><dd>응답</dd></div>
          </dl>
        </li>
      </ol>
      <div class="moi-study-pager-nav"><button type="button">이전</button><button type="button">다음</button></div>
    </div>
  </div>`;

async function measure(browser: Browser, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.setContent(`<style>${CSS}</style>${MARKUP}`);
  const data = await page.evaluate(() => {
    const status = document.querySelector('.moi-study-pager-status')!;
    const card = document.querySelector('.moi-study-peritem > li')!;
    const nav = document.querySelector('.moi-study-pager-nav')!;
    const s = status.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    return {
      statusToCard: Math.round((c.top - s.bottom) * 10) / 10,
      cardToNav: Math.round((n.top - c.bottom) * 10) / 10,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  await context.close();
  return data;
}

describe('#260 결과 페이저 간격 space-5 계약', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('CSS 원문: 이동 영역은 var(--moi-space-5) margin-top이고 하드코딩 px가 없다', () => {
    const block =
      RESULT.match(/\.moi-study-pager-nav\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(block, '.moi-study-pager-nav 블록 존재').toContain('margin-top: var(--moi-space-5)');
    expect(block, '하드코딩 금지').not.toMatch(/margin-top:\s*\d+px/);
  });

  it('토큰: --moi-space-5는 24px다', () => {
    expect(space['5']).toBe(24);
    expect(cssVars['--moi-space-5']).toBe('24px');
  });

  it.each(WIDTHS)('%dpx: 상세 카드 → 이동 영역 24px · 진행 표시 → 카드 8px · 가로 오버플로 0', async (width) => {
    const d = await measure(browser, width);
    expect(d.cardToNav).toBe(space['5']);
    expect(d.statusToCard).toBe(space['2']);
    expect(d.scrollWidth).toBeLessThanOrEqual(d.innerWidth);
  }, 30_000);
});
