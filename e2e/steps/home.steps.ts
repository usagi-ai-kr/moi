import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

Given('홈 페이지에 접속하면', async ({ page }) => {
  await page.goto('/');
});

Then('화면에 {string} 제목이 보인다', async ({ page }, text: string) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText(text);
});

When(
  '{string} API를 호출하면 상태 {int}과 JSON ok=true 를 받는다',
  async ({ request }, path: string, status: number) => {
    const res = await request.get(path);
    expect(res.status()).toBe(status);
    expect(await res.json()).toEqual({ ok: true });
  },
);
