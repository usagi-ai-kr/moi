// #303 — 학습 범위·문항 수 선택 그룹 간격 계약.
//  · CSS 원문: 옵션 컨테이너 gap=space-1(4px)·테두리·radius, 44px 터치 타깃·본문 크기 유지.
//  · 실제 Chromium 계산값: 옵션 사이 간격 4px, 옵션 높이 44px 이상, 그룹 간 간격 16px 유지, 320px 무오버플로.
// (비교군: 옵션 간격 8px → 4px, 그룹 간 간격 16px → 16px 유지)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { cssVars, layout, space } from '@/ui/tokens';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const STUDY_CSS = readFileSync(path.join(REPO_ROOT, 'src/ui/study/study.css'), 'utf8');
const ROOT_VARS = `:root { ${Object.entries(cssVars)
  .map(([name, value]) => `${name}: ${value};`)
  .join(' ')} }`;
const CSS = `${ROOT_VARS}\n${STUDY_CSS}`;

// StartView 마크업과 동일한 구조(#303 — fieldset > legend + .moi-study-options 컨테이너 > 라벨).
const MARKUP = `
  <section class="moi-study">
    <h1 class="moi-study-title">학습 범위 선택</h1>
    <p class="moi-study-desc" id="study-scope-desc">범위와 문제 수를 선택하세요.</p>
    <fieldset class="moi-study-field" aria-describedby="study-scope-desc">
      <legend class="moi-study-legend">범위</legend>
      <div class="moi-study-options">
        <label class="moi-study-radio"><input type="radio" name="study-scope" value="all" checked>전체</label>
        <label class="moi-study-radio"><input type="radio" name="study-scope" value="domain">영역별</label>
        <label class="moi-study-radio"><input type="radio" name="study-scope" value="weak">취약 영역</label>
      </div>
    </fieldset>
    <fieldset class="moi-study-field" aria-label="문제 수">
      <legend class="moi-study-legend">문제 수</legend>
      <div class="moi-study-options">
        <label class="moi-study-radio"><input type="radio" name="study-size" value="4" checked>4문제</label>
        <label class="moi-study-radio"><input type="radio" name="study-size" value="8">8문제</label>
      </div>
    </fieldset>
  </section>`;

function blocksOf(css: string, selector: string): string {
  return (
    css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[^}]*\\}`, 'g')) ?? []
  ).join('\n');
}

async function measure(browser: Browser, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.setContent(`<style>${CSS}</style>${MARKUP}`);
  const data = await page.evaluate(() => {
    const round = (n: number) => Math.round(n * 100) / 100;
    const fieldsets = Array.from(document.querySelectorAll('.moi-study-field'));
    const groups = fieldsets.map((fs) => {
      const wrap = fs.querySelector('.moi-study-options')!;
      const wrapRect = wrap.getBoundingClientRect();
      const options = Array.from(wrap.querySelectorAll('.moi-study-radio'));
      const boxes = options.map((o) => {
        const r = o.getBoundingClientRect();
        return { y: round(r.y), h: round(r.height), w: round(r.width) };
      });
      const optionGaps: number[] = [];
      for (let i = 1; i < boxes.length; i += 1) optionGaps.push(round(boxes[i].y - (boxes[i - 1].y + boxes[i - 1].h)));
      const ws = getComputedStyle(wrap);
      const checked = wrap.querySelector('input:checked');
      const checkedLabel = checked?.closest('label') ?? null;
      return {
        optionGaps,
        optionHeights: boxes.map((b) => b.h),
        optionWidths: boxes.map((b) => b.w),
        wrapGap: ws.gap,
        wrapBorderWidth: ws.borderTopWidth,
        wrapBorderStyle: ws.borderTopStyle,
        wrapRadius: ws.borderTopLeftRadius,
        wrapPadding: ws.paddingTop,
        wrapBottom: round(wrapRect.bottom),
        fieldsetTop: round(fs.getBoundingClientRect().top),
        fieldsetBottom: round(fs.getBoundingClientRect().bottom),
        checkedFontWeight: checkedLabel ? getComputedStyle(checkedLabel).fontWeight : null,
        uncheckedFontWeight: (() => {
          const other = wrap.querySelector('input:not(:checked)')?.closest('label') ?? null;
          return other ? getComputedStyle(other).fontWeight : null;
        })(),
      };
    });
    const groupGaps: number[] = [];
    for (let i = 1; i < groups.length; i += 1) groupGaps.push(round(groups[i].fieldsetTop - groups[i - 1].fieldsetBottom));
    return {
      groups,
      groupGaps,
      overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  await context.close();
  return data;
}

describe('#303 선택 그룹 간격 계약', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('CSS 원문: 옵션 컨테이너는 작은 gap(space-1)·테두리·radius를 갖는다', () => {
    const block = blocksOf(STUDY_CSS, '.moi-study-options');
    expect(block, '.moi-study-options 블록 존재').not.toBe('');
    expect(block).toContain('gap: var(--moi-space-1)');
    expect(block).toContain('border: 1px solid var(--moi-color-border)');
    expect(block).toContain('border-radius: var(--moi-radius-md)');
    expect(block).toContain('padding: var(--moi-space-2)');
    // 토큰만 사용 — gap·패딩·radius 하드코딩 px 금지(테두리 두께 1px만 예외).
    expect(block).not.toMatch(/(gap|padding|border-radius)\s*:\s*[\d.]+px/);
  });

  it('CSS 원문: 터치 타깃 44px·본문 크기·그룹 간 간격 원천은 그대로다', () => {
    const radio = blocksOf(STUDY_CSS, '.moi-study-radio');
    expect(radio).toContain('min-height: var(--moi-touch-min)');
    expect(radio).toContain('font-size: var(--moi-size-body)');
    // 범위↔문항 수 그룹 간 간격 = .moi-study gap + fieldset margin — 변경하지 않는다.
    expect(blocksOf(STUDY_CSS, '.moi-study')).toContain('gap: var(--moi-space-3)');
    expect(blocksOf(STUDY_CSS, '.moi-study-field')).toContain('margin: var(--moi-space-1) 0 0');
  });

  it('토큰: space-1은 4px · space-2는 8px · space-3은 12px · 터치 타깃은 44px다', () => {
    expect(space['1']).toBe(4);
    expect(space['2']).toBe(8);
    expect(space['3']).toBe(12);
    expect(cssVars['--moi-space-1']).toBe('4px');
    expect(layout.touchTargetMin).toBe(44);
    expect(cssVars['--moi-touch-min']).toBe('44px');
  });

  it('실제 레이아웃: 옵션 사이 간격 4px · 옵션 높이 44px 이상 · 그룹 간 간격 16px 유지', async () => {
    const d = await measure(browser, 1280);
    expect(d.groups).toHaveLength(2);
    for (const g of d.groups) {
      expect(g.wrapGap).toBe('4px');
      expect(g.optionGaps).toEqual([4, 4].slice(0, g.optionGaps.length));
      for (const h of g.optionHeights) expect(h).toBeGreaterThanOrEqual(44);
      expect(g.wrapBorderWidth).toBe('1px');
      expect(g.wrapBorderStyle).toBe('solid');
      expect(g.wrapRadius).toBe('8px');
      expect(g.wrapPadding).toBe('8px');
      // 활성 상태는 색상 밖으로 구분된다 — 선택 항목만 굵게(600).
      expect(g.checkedFontWeight).toBe('600');
      expect(g.uncheckedFontWeight).toBe('400');
    }
    // 범위 ↔ 문항 수 그룹 사이 간격은 16px로 유지(12px flex gap + 4px fieldset margin).
    expect(d.groupGaps).toEqual([16]);
  }, 30_000);

  it('실제 레이아웃: 320px에서 가로 오버플로가 없다', async () => {
    const d = await measure(browser, 320);
    expect(d.overflow).toBe(true);
    expect(d.scrollWidth).toBeLessThanOrEqual(d.clientWidth + 1);
  }, 30_000);
});
