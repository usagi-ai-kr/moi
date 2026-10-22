// #148 — 터치 타깃 44px 계약(터치 입력이 하나라도 있는 기기 = any-pointer: coarse).
// Chromium 하이브리드 포인터 에뮬레이션(primary=fine · any=coarse)으로 실제 CSS 적용 결과를 검증한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { cssVars } from '@/ui/tokens';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const SRC_DIR = path.join(REPO_ROOT, 'src');

// Chromium blink 설정 — primaryPointerType=4(fine), availablePointerTypes=6(coarse|fine).
// → pointer: fine / any-pointer: coarse (터치 화면이 있는 랩톱·태블릿 키보드 환경).
const HYBRID_POINTER_ARGS = [
  '--blink-settings=primaryPointerType=4,availablePointerTypes=6,primaryHoverType=4,availableHoverTypes=6',
];

const CSS_FILES = ['src/ui/styles.css', 'src/ui/study/study.css'];
const CSS_TEXT = CSS_FILES.map((rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8')).join('\n');
const ROOT_VARS = `:root { ${Object.entries(cssVars)
  .map(([name, value]) => `${name}: ${value};`)
  .join(' ')} }`;

const TOUCH_TARGETS = [
  'button.moi-study-open',
  'a.moi-study-link',
  'button.moi-study-primary',
  'button.moi-study-secondary',
  'select.moi-study-select',
];

const MARKUP = `
  <button class="moi-study-open">학습 시작</button>
  <a class="moi-study-link" href="#">학습 현황·이력</a>
  <button class="moi-study-primary">제출</button>
  <button class="moi-study-secondary">다음</button>
  <select class="moi-study-select"><option>전체</option></select>
`;

const TOUCH_MIN = Number.parseFloat(cssVars['--moi-touch-min']);
const CONTROL_H = Number.parseFloat(cssVars['--moi-control-h']);

async function measure(page: Page): Promise<{
  media: { pointerCoarse: boolean; pointerFine: boolean; anyPointerCoarse: boolean };
  heights: Record<string, number>;
}> {
  return page.evaluate((selectors) => {
    const heights: Record<string, number> = {};
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`대상 요소가 없습니다: ${selector}`);
      heights[selector] = Math.round(el.getBoundingClientRect().height * 10) / 10;
    }
    return {
      media: {
        pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
        pointerFine: window.matchMedia('(pointer: fine)').matches,
        anyPointerCoarse: window.matchMedia('(any-pointer: coarse)').matches,
      },
      heights,
    };
  }, TOUCH_TARGETS);
}

describe('터치 타깃 44px — 터치 입력이 하나라도 있는 기기(any-pointer: coarse)', () => {
  let hybridBrowser: Browser;
  let desktopBrowser: Browser;

  beforeAll(async () => {
    hybridBrowser = await chromium.launch({ headless: true, args: HYBRID_POINTER_ARGS });
    desktopBrowser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await hybridBrowser?.close();
    await desktopBrowser?.close();
  });

  it(
    '하이브리드 기기(pointer: fine · any-pointer: coarse)에서 터치 타깃이 44px 이상이다',
    async () => {
      const context = await hybridBrowser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.setContent(`<style>${ROOT_VARS}${CSS_TEXT}</style>${MARKUP}`);
      const { media, heights } = await measure(page);
      await context.close();

      // 하이브리드 에뮬레이션이 실제로 성립했는지 먼저 확인한다 (pointer만 coarse면 회귀를 못 잡는다).
      expect(media.pointerCoarse, 'pointer: coarse는 매칭되지 않아야 한다').toBe(false);
      expect(media.anyPointerCoarse, 'any-pointer: coarse는 매칭되어야 한다').toBe(true);
      for (const [selector, height] of Object.entries(heights)) {
        expect(height, `${selector} 터치 타깃`).toBeGreaterThanOrEqual(TOUCH_MIN);
      }
    },
    30_000,
  );

  it(
    '터치가 없는 데스크톱은 버튼 높이 기준(control height)을 유지한다',
    async () => {
      const context = await desktopBrowser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.setContent(`<style>${ROOT_VARS}${CSS_TEXT}</style>${MARKUP}`);
      const { media, heights } = await measure(page);
      await context.close();

      expect(media.anyPointerCoarse, 'any-pointer: coarse는 매칭되지 않아야 한다').toBe(false);
      for (const [selector, height] of Object.entries(heights)) {
        expect(height, `${selector} 데스크톱 높이`).toBe(CONTROL_H);
      }
    },
    30_000,
  );
});

describe('포인터 미디어 쿼리 계약', () => {
  it('src CSS의 포인터 기반 미디어 쿼리는 any-pointer 기준이다', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })) {
      if (!file.endsWith('.css')) continue;
      const absolute = path.join(SRC_DIR, file);
      const text = readFileSync(absolute, 'utf8');
      for (const match of text.match(/@media[^{]*\([^)]*pointer[^)]*\)\s*\{/g) ?? []) {
        if (!match.includes('any-pointer')) {
          offenders.push(`${file}: ${match.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
