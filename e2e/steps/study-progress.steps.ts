import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { copy } from '../../src/ui/copy';

const { Given, When, Then } = createBdd();

type ProgressDto = {
  examId: string;
  totalQuestions: number;
  uniqueFirstSolved: number;
  coverage: number;
  overallAccuracy: number | null;
  domains: Array<{ domainId: string; uniqueFirstSolved: number; gradedAttempts: number; cumulativeAccuracy: number | null; recentAccuracy: number | null; status: 'ok' | 'insufficient-data' }>;
  domainQuestionCounts: Record<string, number>;
  weakDomains: unknown[];
};

let dto: ProgressDto;
let failStatsOnce: boolean;
let statsDelayMs: number;

function defaultProgress(): ProgressDto {
  return {
    examId: 'saa-c03',
    totalQuestions: 500,
    uniqueFirstSolved: 50,
    coverage: 0.1,
    overallAccuracy: 0.7,
    domains: [
      { domainId: 'dom-security', uniqueFirstSolved: 30, gradedAttempts: 35, cumulativeAccuracy: 0.7, recentAccuracy: 0.6, status: 'ok' },
      { domainId: 'dom-resilience', uniqueFirstSolved: 12, gradedAttempts: 16, cumulativeAccuracy: 0.75, recentAccuracy: 0.7, status: 'ok' },
    ],
    domainQuestionCounts: {
      'dom-security': 150,
      'dom-resilience': 130,
      'dom-performance': 120,
      'dom-cost-optimization': 100,
    },
    weakDomains: [],
  };
}

Given('학습 진척도 API 모의가 준비되면', async ({ page }) => {
  dto = defaultProgress();
  failStatsOnce = false;
  statsDelayMs = 0;
  await page.route('**/api/me', async (route) => {
    await route.fulfill({ status: 200, json: { user: { id: 'progress-user-a' } } });
  });
  await page.route('**/api/study/stats**', async (route) => {
    if (statsDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, statsDelayMs));
    if (failStatsOnce) {
      failStatsOnce = false;
      await route.fulfill({ status: 503, json: { error: 'temporary' } });
      return;
    }
    await route.fulfill({ status: 200, json: dto });
  });
});

Given('진척도 응답에 학습 기록이 없으면', async () => {
  dto = { ...dto, uniqueFirstSolved: 0, coverage: 0, domains: [] };
});

Given('활성 문제 풀이가 비어 있으면', async () => {
  dto = { ...dto, totalQuestions: 0, uniqueFirstSolved: 0, coverage: 0, domains: [], domainQuestionCounts: {} };
});

Given('진척도 첫 요청이 실패하면', async () => {
  failStatsOnce = true;
});

Given('진척도 응답이 지연되면', async () => {
  statsDelayMs = 5000;
});

When('학습 범위 선택 화면을 열면', async ({ page }) => {
  await page.goto('/study/new');
  await expect(page.getByRole('heading', { name: copy.study.startTitle })).toBeVisible();
});

When('학습 범위를 {string}로 선택하면', async ({ page }, scopeLabel: string) => {
  await page.getByRole('radio', { name: scopeLabel }).check();
});

When('취약 영역 범위를 선택하면', async ({ page }) => {
  await page.getByRole('radio', { name: copy.study.scopeWeak }).check();
});

When('영역을 {string}으로 선택하면', async ({ page }, label: string) => {
  await page.getByRole('combobox', { name: copy.study.domainLabel }).selectOption({ label });
});

When('진척도를 다시 시도하면', async ({ page }) => {
  await page.getByRole('button', { name: copy.study.retry }).click();
});

Then('진도 문구가 {string}로 보인다', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});

Then('진도 막대 값은 {int}이다', async ({ page }, value: number) => {
  const progress = page.getByRole('progressbar');
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute('value', String(value));
  await expect(progress).toHaveAttribute('max', '100');
});

Then('진척도 확인 불가 안내가 보인다', async ({ page }) => {
  await expect(page.getByRole('status')).toContainText(copy.study.progressUnavailable);
  await expect(page.locator('body')).not.toContainText('NaN');
});

Then('진척도 오류와 재시도 버튼이 보인다', async ({ page }) => {
  await expect(page.getByRole('alert')).toContainText(copy.study.progressError);
  await expect(page.getByRole('button', { name: copy.study.retry })).toBeEnabled();
});

Then('진척도 로딩 안내가 보인다', async ({ page }) => {
  await expect(page.getByRole('status')).toContainText(copy.study.progressLoading);
});

Then('학습 시작 버튼을 사용할 수 있다', async ({ page }) => {
  await expect(page.getByRole('button', { name: copy.study.startAction })).toBeEnabled();
});

Then('진도 막대는 없다', async ({ page }) => {
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

Then('범위 진척도와 선택 영역이 겹치지 않는다', async ({ page }) => {
  const progress = await page.locator('.moi-scope-progress').boundingBox();
  const selection = await page.locator('.moi-study-field').first().locator('.moi-study-radio').last().boundingBox();
  expect(progress).not.toBeNull();
  expect(selection).not.toBeNull();
  expect((selection?.y ?? 0) + (selection?.height ?? 0)).toBeLessThanOrEqual(progress?.y ?? 0);
});

Then('학습 진도 화면을 캡처한다', async ({ page }) => {
  await page.screenshot({ path: 'tmp/progress-330-1280-200.png', fullPage: true });
});

Then('진척도 화면을 캡처한다', async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: `tmp/progress-330-${width}.png`, fullPage: true });
});
