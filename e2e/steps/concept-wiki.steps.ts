import { expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { createBdd } from 'playwright-bdd';
import { emulate200PercentTextZoom } from '../support/text-zoom';

const { Given, When, Then } = createBdd();
const detailCalls = new WeakMap<Page, number>();
const conceptItems = Array.from({ length: 16 }, (_, index) => ({
  conceptId: `concept-${String(index + 1).padStart(2, '0')}`,
  title: `검수 개념 ${index + 1}`,
  relatedQuestionCount: index + 1,
  reason: '오답 1문항 · 북마크 1문항',
}));

Given('개념 위키 API 모의가 준비되면', async ({ page }) => {
  detailCalls.set(page, 0);
  await page.route('**/api/me', async (route) => {
    await route.fulfill({ status: 200, json: { user: { id: 'e2e-concept-user' } } });
  });
  await page.route('**/api/concepts/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/recommendations')) {
      await route.fulfill({
        status: 200,
        json: { examId: 'saa-c03', total: conceptItems.length, reviewedContentAvailable: true, items: conceptItems },
      });
      return;
    }
    detailCalls.set(page, (detailCalls.get(page) ?? 0) + 1);
    await route.fulfill({
      status: 200,
      json: {
        conceptId: 'concept-01',
        title: '검수 개념 1',
        summary: '선택한 개념의 간결한 검수 요약입니다.',
        confusions: [{ term: '권한 정책', with: '신뢰 정책', difference: '허용 작업과 수임 주체를 구분합니다.' }],
        sourceUrls: ['https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html'],
        relatedQuestions: [{ stem: '연결된 문제 본문입니다.', hasWrongHistory: true, bookmarked: true }],
      },
    });
  });
});

When('개념 위키 화면에 접속하면', async ({ page }) => {
  await page.goto('/concepts?exam=saa-c03');
});

When('개념 화면 글자를 200%로 키우면', async ({ page }) => {
  await emulate200PercentTextZoom(page);
});

Then('개념 위키 제목과 목차가 보인다', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: '개념 위키' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '추천 개념 목차' })).toBeVisible();
});

Then('추천 개념은 {int}개다', async ({ page }, count: number) => {
  await expect(page.locator('.moi-concept-list > li')).toHaveCount(count);
});

Then('개념 상세 API는 아직 요청하지 않았다', async ({ page }) => {
  expect(detailCalls.get(page)).toBe(0);
});

When('첫 개념을 키보드로 연다', async ({ page }) => {
  const firstConcept = page.locator('.moi-concept-choice').first();
  await firstConcept.focus();
  await page.keyboard.press('Enter');
});

Then('선택한 개념 상세가 보인다', async ({ page }) => {
  await expect(page.getByText('선택한 개념의 간결한 검수 요약입니다.')).toBeVisible();
  await expect(page.locator('.moi-concept-related summary')).toContainText('관련 문제 1개 보기');
});

When('연결 문제 목록을 펼치면', async ({ page }) => {
  await page.locator('.moi-concept-related summary').click();
});

Then('연결된 문제 본문이 보인다', async ({ page }) => {
  await expect(page.getByText('연결된 문제 본문입니다.')).toBeVisible();
});

Then('첫 개념 버튼이 선택 상태다', async ({ page }) => {
  await expect(page.locator('.moi-concept-choice').first()).toHaveAttribute('aria-pressed', 'true');
});

Then('개념 상세 API는 {int}회 요청됐다', async ({ page }, count: number) => {
  await expect.poll(() => detailCalls.get(page)).toBe(count);
});

Then('개념 위키에 가로 오버플로가 없다', async ({ page }) => {
  await expect(page.locator('.moi-concept-list > li')).toHaveCount(16);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (await page.evaluate(() => window.innerWidth) === 375) {
    await page.screenshot({ path: resolve(process.cwd(), 'tmp/concept-wiki-375.png'), fullPage: true });
  }
});
