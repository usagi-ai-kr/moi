import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

let meStatus = 401;
let meUserId = 'e2e-user-1';
let expireAfterLogout = false;

Given('API 모의가 준비되면', async ({ page }) => {
  meStatus = 401;
  meUserId = 'e2e-user-1';
  expireAfterLogout = false;
  await page.route('**/api/me', async (route) => {
    if (meStatus === 200 && !expireAfterLogout) {
      await route.fulfill({ status: 200, json: { user: { id: meUserId } } });
    } else {
      await route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    }
  });
});

Given('API가 비로그인 상태이면', async () => {
  meStatus = 401;
});

Given('API가 사용자 {string}로 로그인 상태이면', async ({}, userId: string) => {
  meStatus = 200;
  meUserId = userId;
});

Given('로그아웃 API가 성공하고 이후 세션이 만료되면', async ({ page }) => {
  await page.route('**/auth/logout', async (route) => {
    expireAfterLogout = true;
    // 진행 중 UI를 관측할 수 있게 실제 네트워크 지연을 흉내낸다
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({ status: 204, body: '' });
  });
});

Given('뷰포트 너비가 {int}px이면', async ({ page }, width: number) => {
  await page.setViewportSize({ width, height: 800 });
});

When('"?auth=error"로 접속하면', async ({ page }) => {
  await page.goto('/?auth=error');
});

When('로그아웃 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: '로그아웃' }).click();
});

When('계정 메뉴로 이동한다', async ({ page }) => {
  await page.getByRole('link', { name: '계정' }).click();
  await expect(page).toHaveURL(/\/account$/);
});

Then('카카오 로그인 버튼이 보인다', async ({ page }) => {
  await expect(page.getByRole('link', { name: '카카오 로그인' })).toBeVisible();
});

Then('오류 안내가 보이지 않는다', async ({ page }) => {
  await expect(page.getByRole('alert')).toHaveCount(0);
});

Then('학습 시작 화면과 상단 메뉴가 보인다', async ({ page }) => {
  await expect(page.getByRole('link', { name: '학습 시작' })).toBeVisible();
  await expect(page.getByRole('link', { name: '학습 현황/이력' })).toBeVisible();
  await expect(page.getByRole('link', { name: '계정' })).toBeVisible();
  await expect(page.getByRole('button', { name: '20문제 학습' })).toBeVisible();
});

Then('원본 사용자 id가 노출되지 않는다', async ({ page }) => {
  await expect(page.getByTestId('masked-id')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(meUserId);
  const ariaLabels = await page.locator('[aria-label]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') ?? ''),
  );
  expect(ariaLabels.join(' ')).not.toContain(meUserId);
});

Then('로그인 오류 안내가 보인다', async ({ page }) => {
  await expect(page.getByRole('alert')).toContainText('다시 시도');
});

Then('주소창에서 auth 파라미터가 정리된다', async ({ page }) => {
  await expect.poll(() => page.url()).not.toContain('auth=');
});

Then('진행 중 표시가 보인다', async ({ page }) => {
  const pending = page.getByRole('button', { name: /로그아웃하고 있습니다/ });
  await expect(pending).toBeDisabled();
  await expect(pending).toHaveAttribute('aria-busy', 'true');
});

Then('로그아웃 완료 후 카카오 로그인 버튼이 보인다', async ({ page }) => {
  await expect(page.getByRole('link', { name: '카카오 로그인' })).toBeVisible({ timeout: 10_000 });
});

Then('가로 오버플로가 없다', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
