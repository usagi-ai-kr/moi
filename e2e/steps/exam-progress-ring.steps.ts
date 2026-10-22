// #353 AC — 시험 전체 진척도는 서버 통계 API를 단일 진실 원천으로 사용한다.
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Given, Then, When } = createBdd();

async function mockExamProgressApi(
  page: import('@playwright/test').Page,
  response: { coverage: number; totalQuestions?: number } | null,
  delayMs = 0,
) {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.startsWith('/api/')) return route.continue();
    if (pathname === '/api/me') {
      return route.fulfill({ status: 200, json: { user: { id: '353-e2e-user' } } });
    }
    if (pathname === '/api/study/stats') {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (!response) return route.fulfill({ status: 500, json: { error: 'stats_unavailable' } });
      return route.fulfill({
        status: 200,
        json: {
          examId: 'saa-c03',
          totalQuestions: response.totalQuestions ?? 500,
          domainQuestionCounts: {},
          uniqueFirstSolved: Math.round(response.coverage * (response.totalQuestions ?? 500)),
          coverage: response.coverage,
          overallAccuracy: null,
          domains: [],
          weakDomains: [],
        },
      });
    }
    if (pathname === '/api/study/sets/current') {
      return route.fulfill({ status: 404, json: { error: 'no_active_set' } });
    }
    if (pathname === '/api/study/sets') {
      return route.fulfill({ status: 200, json: { items: [], total: 0 } });
    }
    if (pathname.startsWith('/api/review/candidates')) {
      return route.fulfill({ status: 200, json: { examId: 'saa-c03', mode: 'wrong', total: 0, items: [] } });
    }
    if (pathname.startsWith('/api/review/sessions/current')) {
      return route.fulfill({ status: 404, json: { error: 'not_found' } });
    }
    if (pathname.startsWith('/api/review/bookmarks')) {
      return route.fulfill({ status: 200, json: { examId: 'saa-c03', total: 0, items: [] } });
    }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
}

Given('시험 전체 진척도 API가 {int}%를 반환하면', async ({ page }, percent: number) => {
  await mockExamProgressApi(page, { coverage: percent / 100 });
});

Given('시험 전체 진척도 API가 실패하면', async ({ page }) => {
  await mockExamProgressApi(page, null);
});

Given('시험 전체 진척도 API의 문항 분모가 0이면', async ({ page }) => {
  await mockExamProgressApi(page, { coverage: 0, totalQuestions: 0 });
});

Given('시험 전체 진척도 API가 늦게 응답하면', async ({ page }) => {
  await mockExamProgressApi(page, { coverage: 0.37 }, 3_000);
});

Then('시험 전체 진척도 {int}%가 접근 가능한 링으로 보인다', async ({ page }, percent: number) => {
  const progress = page.getByRole('progressbar', { name: `AWS SAA-C03 학습 진척도 ${percent}퍼센트` });
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuemin', '0');
  await expect(progress).toHaveAttribute('aria-valuemax', '100');
  await expect(progress).toHaveAttribute('aria-valuenow', String(percent));
  await expect(progress).toContainText(`${percent}%`);
  await expect(progress.locator('svg')).toHaveAttribute('aria-hidden', 'true');
});

Then('시험 진척도 링은 시험 선택기 바로 뒤에 있다', async ({ page }) => {
  const order = await page.evaluate(() => {
    const selector = document.querySelector('.moi-content-exam > .moi-exam-selector');
    const progress = document.querySelector('.moi-content-exam [role="progressbar"]');
    return selector && progress && (selector.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  expect(order).toBe(true);
});

Then('진척도 미조회 표시가 보이고 0% 링은 보이지 않는다', async ({ page }) => {
  await expect(page.getByText('—', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByText('0%', { exact: true })).toHaveCount(0);
});

Then('진척도 로딩 표시가 보인다', async ({ page }) => {
  await expect(page.getByRole('status', { name: 'AWS SAA-C03 학습 진척도 불러오는 중' })).toBeVisible();
});

Then('시험 진척도 링은 보이지 않는다', async ({ page }) => {
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

Then('시험 selector와 진척도 링은 겹치지 않는다', async ({ page }) => {
  const layout = await page.evaluate(() => {
    const selector = document.querySelector('.moi-content-exam > .moi-exam-selector');
    const progress = document.querySelector('.moi-content-exam [role="progressbar"]');
    if (!selector || !progress) return null;
    const a = selector.getBoundingClientRect();
    const b = progress.getBoundingClientRect();
    return !(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
  });
  expect(layout).toBe(true);
});

When('iPhone 뷰포트 캡처를 저장한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.moi-content-exam')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'AWS SAA-C03 학습 진척도 37퍼센트' })).toBeVisible();
  const screenshotPath = process.env.MOI_353_SCREENSHOT_PATH;
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
});
