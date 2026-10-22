import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

// #303 — 학습 범위·문항 수 선택 그룹 구조·간격 계측(실제 Chromium 계산값).
const { When, Then } = createBdd();

interface GroupMeasure {
  legend: string;
  hasWrap: boolean;
  wrapIsDirectChild: boolean;
  optionCount: number;
  radioCount: number;
  gaps: number[];
  heights: number[];
  top: number;
  bottom: number;
}

async function measureGroups(page: import('@playwright/test').Page): Promise<GroupMeasure[]> {
  // 시작 화면 렌더 대기 — 측정 전에 컨테이너가 존재해야 한다.
  await page.locator('.moi-study-options').first().waitFor({ state: 'visible', timeout: 15_000 });
  return page.evaluate(() => {
    const round = (n: number) => Math.round(n * 100) / 100;
    const fieldsets = Array.from(document.querySelectorAll('.moi-study-field'));
    return fieldsets.map((fs) => {
      const wrap = fs.querySelector('.moi-study-options');
      const options = wrap ? Array.from(wrap.querySelectorAll('.moi-study-radio')) : [];
      const boxes = options.map((o) => {
        const r = o.getBoundingClientRect();
        return { y: r.y, h: r.height };
      });
      const gaps: number[] = [];
      for (let i = 1; i < boxes.length; i += 1) {
        gaps.push(round(boxes[i].y - (boxes[i - 1].y + boxes[i - 1].h)));
      }
      const rect = fs.getBoundingClientRect();
      return {
        legend: fs.querySelector('.moi-study-legend')?.textContent?.trim() ?? '',
        hasWrap: !!wrap,
        wrapIsDirectChild: wrap?.parentElement === fs,
        optionCount: options.length,
        radioCount: fs.querySelectorAll('input[type="radio"]').length,
        gaps,
        heights: boxes.map((b) => round(b.h)),
        top: round(rect.top),
        bottom: round(rect.bottom),
      };
    });
  });
}

Then('범위와 문항 수 선택 그룹이 각각 하나의 그룹으로 묶여 있다', async ({ page }) => {
  const groups = await measureGroups(page);
  expect(groups).toHaveLength(2);
  expect(groups.map((g) => g.legend)).toEqual(['범위', '문제 수']);
  for (const g of groups) {
    expect(g.hasWrap, `${g.legend} 그룹 컨테이너 없음`).toBe(true);
    expect(g.wrapIsDirectChild, `${g.legend} 컨테이너가 fieldset 직속이 아니다`).toBe(true);
    // 옵션이 컨테이너 밖으로 새지 않는다 — 그룹 단위로 하나처럼 보인다.
    expect(g.optionCount, `${g.legend} 옵션 수`).toBeGreaterThan(1);
    expect(g.radioCount, `${g.legend} 라디오 수`).toBe(g.optionCount);
  }
});

Then('선택 그룹의 옵션 사이 간격은 {int}px다', async ({ page }, gap: number) => {
  const groups = await measureGroups(page);
  for (const g of groups) {
    expect(g.gaps.length, `${g.legend} 인접 옵션 쌍 수`).toBe(g.optionCount - 1);
    for (const actual of g.gaps) expect(actual, `${g.legend} 옵션 간격`).toBe(gap);
  }
});

Then('선택 그룹의 옵션 높이는 {int}px 이상이다', async ({ page }, min: number) => {
  const groups = await measureGroups(page);
  for (const g of groups) {
    for (const h of g.heights) expect(h, `${g.legend} 옵션 높이`).toBeGreaterThanOrEqual(min);
  }
});

Then('범위와 문항 수 그룹 사이 간격은 {int}px다', async ({ page }, gap: number) => {
  const groups = await measureGroups(page);
  expect(groups).toHaveLength(2);
  const actual = Math.round((groups[1].top - groups[0].bottom) * 100) / 100;
  expect(actual, '범위↔문항 수 그룹 간 간격').toBe(gap);
});

When('범위 첫 번째 옵션에 포커스를 두고 아래 방향키를 누르면', async ({ page }) => {
  await page.locator('input[name="study-scope"]').first().focus();
  await page.keyboard.press('ArrowDown');
});

Then('영역별 옵션이 선택되어 있다', async ({ page }) => {
  const radio = page.locator('input[name="study-scope"][value="domain"]');
  await expect(radio).toBeChecked();
  await expect(radio).toBeFocused();
});

When('문항 수 첫 번째 옵션에 포커스를 두고 오른쪽 방향키를 누르면', async ({ page }) => {
  await page.locator('input[name="study-size"]').first().focus();
  await page.keyboard.press('ArrowRight');
});

Then('8문제 옵션이 선택되어 있다', async ({ page }) => {
  const radio = page.locator('input[name="study-size"][value="8"]');
  await expect(radio).toBeChecked();
  await expect(radio).toBeFocused();
});
