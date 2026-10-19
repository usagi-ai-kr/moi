import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { copy } from '../../src/ui/copy';

const { Given, When, Then } = createBdd();

// viewport 스크린샷 보존: 320/375/768/1024/1280 전부 (tdd-bdd-testing 브라우저 검증 규칙)
const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1280];
const SCREENSHOT_DIR = '/private/tmp/moi-orchestrator-next';

Given('로그인 없이 {string} 에 접속하면', async ({ page }, path: string) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(path);
});

Given('세션 API가 실패하는 상태에서 {string} 에 접속하면', async ({ page }, path: string) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/api/me', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto(path);
});

Then('라이선스 고지가 보인다', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: copy.licenses.title })).toBeVisible();
  await expect(page.getByLabel(copy.licenses.heading)).toBeVisible();
  // 실제 원문의 95개 버전별 항목이 모두 렌더된다
  await expect(page.locator('ol > li.moi-license-card')).toHaveCount(95);
});

Then('"확인 필요" 항목이 숨겨지지 않는다', async ({ page }) => {
  await expect(page.locator('.moi-license-unverified')).toHaveCount(4);
  await expect(page.locator('.moi-license-unverified').first()).toBeVisible();
});

When('홈 화면에서 푸터 라이선스 링크로 이동하면', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('link', { name: copy.licenses.footerLink }).click();
});

Then('라이선스 페이지로 이동한다', async ({ page }) => {
  await expect(page).toHaveURL(/\/licenses$/);
  await expect(page.getByRole('heading', { level: 1, name: copy.licenses.title })).toBeVisible();
});

When('홈으로 돌아가기 링크를 누르면', async ({ page }) => {
  await page.getByRole('link', { name: copy.licenses.backHome }).click();
});

Then('홈 화면으로 돌아간다', async ({ page }) => {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: copy.brand })).toBeVisible();
});

Given('라이선스 페이지에 포커스를 두면', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/licenses');
  await page.getByRole('heading', { level: 1, name: copy.licenses.title }).waitFor();
});

When('Tab 키를 누르면', async ({ page }) => {
  await page.keyboard.press('Tab');
});

Then('포커스가 링크에 놓인다', async ({ page }) => {
  const onLink = await page.evaluate(() => document.activeElement?.tagName === 'A');
  expect(onLink).toBe(true);
});

Then('원문 고지 자산 링크가 실제로 응답한다', async ({ page }) => {
  // 다운로드 링크(?url 정적자산, 빌드에선 해시 자산)가 실제 200으로 응답하는지 확인한다.
  const href = await page.locator('a[download]').getAttribute('href');
  const res = await page.request.get(href as string);
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain('THIRD_PARTY_NOTICES');
  expect(text).toContain('확인 필요');
});

Then('{int}\\/{int}\\/{int}\\/{int}\\/{int} 각 너비에서 가로 스크롤 없이 고지가 보인다',
  async ({ page }, w1: number, w2: number, w3: number, w4: number, w5: number) => {
    const widths = [w1, w2, w3, w4, w5];
    expect(widths).toEqual(VIEWPORT_WIDTHS);
    for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/licenses');
    await expect(page.getByRole('heading', { level: 1, name: copy.licenses.title })).toBeVisible();
    // 첫 고지 카드의 라이선스·출처가 실제로 보인다(가시성 확인)
    await expect(page.locator('.moi-license-badge').first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    // 실제계정/개인정보가 없는 공개 고지 화면만 캡처한다. animations 비활성화로
    // .moi-enter 진입 애니메이션 중간 프레임이 아닌 최종 상태를 고정한다.
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/licenses-${width}.png`,
      animations: 'disabled',
    });
  }
});
