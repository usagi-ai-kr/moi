import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

// 앱 푸터에는 버전만 표시하고 빌드 메타데이터는 노출하지 않는지 검증.
const { Then } = createBdd();

Then('푸터에 버전만 표시된다', async ({ page }) => {
  const footer = page.locator('footer.moi-version-footer');
  await expect(footer).toBeVisible();
  const text = (await footer.textContent())?.trim() ?? '';
  expect(text).toMatch(/^v\d+\.\d+\.\d+$/);
});

Then('푸터에 날짜와 PR 번호가 없다', async ({ page }) => {
  const text = (await page.locator('footer.moi-version-footer').textContent())?.trim() ?? '';
  expect(text).not.toMatch(/#\d+|\d{4}-\d{2}-\d{2}/);
});

Then('푸터는 가운데 정렬이다', async ({ page }) => {
  const align = await page
    .locator('footer.moi-version-footer')
    .evaluate((el) => getComputedStyle(el).textAlign);
  expect(align).toBe('center');
});

Then('푸터 글자색 대비가 4.5 대 1 이상이다', async ({ page }) => {
  const ratio = await page.locator('footer.moi-version-footer').evaluate((el) => {
    const parse = (color: string): number[] =>
      (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (rgb: number[]): number => {
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const fg = luminance(parse(getComputedStyle(el).color));
    let node: HTMLElement | null = el as HTMLElement;
    let bg = [255, 255, 255];
    while (node) {
      const color = getComputedStyle(node).backgroundColor;
      if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        bg = parse(color);
        break;
      }
      node = node.parentElement;
    }
    const back = luminance(bg);
    const [high, low] = fg > back ? [fg, back] : [back, fg];
    return (high + 0.05) / (low + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
