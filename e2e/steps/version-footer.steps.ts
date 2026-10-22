import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

// 앱 버전·빌드 일자 푸터 검증 (#footer-version·#336) — 형식·중앙 정렬·저대비 색·가운데점 구분자.
const { Then } = createBdd();

Then('푸터에 버전과 빌드 일자가 표시된다', async ({ page }) => {
  const footer = page.locator('footer.moi-version-footer');
  await expect(footer).toBeVisible();
  const text = (await footer.textContent())?.trim() ?? '';
  // v{MAJOR.MINOR.PATCH} (yy·MM·dd) — 값은 마일스톤 단일 소스에서 온다.
  expect(text).toMatch(/^v\d+\.\d+\.\d+ \(\d{2}·\d{2}·\d{2}\)$/);
  // #336 — 언더바 문자가 섞이면 날짜가 언더바처럼 보인다.
  expect(text).not.toContain('_');
  expect([...text].some((ch) => ch.codePointAt(0) === 95)).toBe(false);
});

Then('푸터는 가운데 정렬이다', async ({ page }) => {
  const align = await page
    .locator('footer.moi-version-footer')
    .evaluate((el) => getComputedStyle(el).textAlign);
  expect(align).toBe('center');
});

Then('푸터에 밑줄이 없다', async ({ page }) => {
  // #336 — 상위 요소의 text-decoration 이 상속되어 날짜가 밑줄처럼 보이면 안 된다.
  const decorations = await page.locator('footer.moi-version-footer').evaluate((el) => {
    const chain: string[] = [];
    let node: HTMLElement | null = el as HTMLElement;
    while (node) {
      chain.push(getComputedStyle(node).textDecorationLine);
      node = node.parentElement;
    }
    return chain;
  });
  for (const line of decorations) expect(line).toBe('none');
});

Then('푸터 날짜 구분자는 가운데점으로 보인다', async ({ page }) => {
  // #336 — 렌더링 문자열이 언더바처럼 오독될 수 있는 하이픈 대신 가운데점을 쓴다.
  const text = (await page.locator('footer.moi-version-footer').textContent())?.trim() ?? '';
  expect(text).toMatch(/^v\d+\.\d+\.\d+ \(\d{2}·\d{2}·\d{2}\)$/);
  expect(text).not.toContain('_');
  expect(text).not.toMatch(/\d{2}-\d{2}/);
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
