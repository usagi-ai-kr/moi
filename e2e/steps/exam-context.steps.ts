// #239 시험 context·selector E2E — 실제 계정·D1 없이 결정적 route mock만 사용한다.
// AC 번호를 각 스텝에 병기해 추적한다 (AC 1 라벨 · AC 2 selector · AC 3 URL · AC 4 반응형).
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { copy } from '../../src/ui/copy';

const { Given, When, Then } = createBdd();

const STATS_DTO = {
  examId: 'saa-c03',
  totalQuestions: 500,
  uniqueFirstSolved: 20,
  coverage: 0.04,
  overallAccuracy: 0.7,
  domains: [],
  weakDomains: [],
} as const;

// 통계 요청에 실린 시험 코드 — "데이터 요청이 선택 시험을 쓰는가"를 확인한다.
let statsExamIds: string[] = [];

Given('시험 화면 API 모의가 준비되면', async ({ page }) => {
  statsExamIds = [];
  await page.route('**/api/me', async (route) => {
    await route.fulfill({ status: 200, json: { user: { id: 'e2e-user-1' } } });
  });
  await page.route('**/api/study/stats**', async (route) => {
    const url = new URL(route.request().url());
    statsExamIds.push(url.searchParams.get('examId') ?? '');
    await route.fulfill({ status: 200, json: STATS_DTO });
  });
  await page.route('**/api/study/sets/current**', async (route) => {
    await route.fulfill({ status: 404, json: { error: 'no_active_set' } });
  });
  await page.route('**/api/study/sets**', async (route) => {
    await route.fulfill({ status: 200, json: { items: [], total: 0 } });
  });
  await page.route('**/api/review/candidates**', async (route) => {
    await route.fulfill({
      status: 200,
      json: { examId: 'saa-c03', mode: 'wrong', total: 0, items: [] },
    });
  });
  await page.route('**/api/review/sessions/current**', async (route) => {
    await route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
  await page.route('**/api/review/bookmarks**', async (route) => {
    await route.fulfill({ status: 200, json: { examId: 'saa-c03', total: 0, items: [] } });
  });
});

When('시험 코드가 포함된 주소로 이동한다', async ({ page }) => {
  await page.goto('/history?tab=completed&exam=saa-c03');
});

When('잘못된 시험 주소로 이동한다', async ({ page }) => {
  await page.goto('/history?tab=completed&exam=exam-saa-c03');
});

When('시험 값 없는 주소로 이동한다', async ({ page }) => {
  await page.goto('/history?tab=completed');
});

Then('시험 기준 라벨이 보인다', async ({ page }) => {
  const badge = page.locator('.moi-exam-scope');
  await expect(badge).toHaveCount(1);
  await expect(badge).toContainText(copy.exam.scopeLabel);
  await expect(badge).toContainText('AWS SAA-C03');
});

Then('시험 selector는 비활성이 아니다', async ({ page }) => {
  const select = page.getByRole('combobox', { name: copy.exam.label });
  await expect(select).toBeVisible();
  await expect(select).toBeEnabled();
});

Then('시험 selector의 옵션은 1개다', async ({ page }) => {
  const select = page.getByRole('combobox', { name: copy.exam.label });
  await expect(select.locator('option')).toHaveCount(1);
  await expect(select.locator('option')).toHaveText('AWS SAA-C03');
});

Then('시험 selector의 접근 이름은 {string}이다', async ({ page }, name: string) => {
  const select = page.getByRole('combobox', { name: copy.exam.label });
  await expect(select).toBeVisible();
  await expect(select).toHaveAccessibleName(name);
  await expect(select).toHaveValue('saa-c03');
});

Then('시험 selector에 포커스를 둘 수 있다', async ({ page }) => {
  const select = page.getByRole('combobox', { name: copy.exam.label });
  await select.focus();
  await expect(select).toBeFocused();
});

Then('주소창의 시험 값은 {string} 이다', async ({ page }, code: string) => {
  await expect.poll(() => new URL(page.url()).searchParams.get('exam')).toBe(code);
  // 정규화는 replace다 — pathname·다른 query는 보존된다.
  await expect(page).toHaveURL(/\/history\?tab=completed&exam=/);
});

Then('주소창에 시험 값이 없다', async ({ page }) => {
  await expect.poll(() => new URL(page.url()).searchParams.get('exam')).toBeNull();
});

Then('화면에 내부 시험 식별자가 보이지 않는다', async ({ page }) => {
  const text = await page.evaluate(() => document.body.textContent ?? '');
  expect(text).not.toContain('exam-saa-c03');
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

Then('통계 요청이 선택 시험 코드를 보낸다', async () => {
  await expect.poll(() => statsExamIds.length).toBeGreaterThan(0);
  expect(statsExamIds.every((id) => id === 'saa-c03')).toBe(true);
});
