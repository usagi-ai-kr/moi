import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { copy } from '../../src/ui/copy';

// #224 하위 탭 E2E route mock — 결정적 통계·이력 응답을 제공한다.
// AC 번호를 각 스텝에 병기해 추적한다.
const { Given, When, Then } = createBdd();

let statsGetCount = 0;
const TOTAL = 45;
const PAGE_SIZE = 20;
// 늦게 도착하는 재요청까지 검출하기 위한 통계 요청 정착 시간(ms).
const STATS_SETTLE_MS = 1500;

function historyItems(page: number) {
  const start = (page - 1) * PAGE_SIZE;
  const count = Math.max(0, Math.min(PAGE_SIZE, TOTAL - start));
  return Array.from({ length: count }, (_, k) => {
    const i = start + k;
    // 자리수(1/10/100)·0문제/0%·영역명을 섞어 열 정렬이 흔들리지 않는지 확인한다 (#224 추가 피드백).
    const variant = i % 5;
    return {
      id: `set-e2e-${i}`,
      examId: 'saa-c03',
      mode: variant === 3 ? 'domain' : 'all',
      ...(variant === 3 ? { domainId: 'dom-cost-optimization' } : {}),
      submittedAt: 1700000000000 + i * 1000,
      correctCount: variant === 0 ? 0 : variant === 1 ? 1 : variant === 2 ? 100 : 10,
      accuracyPercent: variant === 0 ? 0 : variant === 1 ? 1 : variant === 2 ? 100 : 50,
    };
  });
}

const STATS_DTO = {
  examId: 'saa-c03',
  totalQuestions: 500,
  uniqueFirstSolved: 20,
  coverage: 0.04,
  overallAccuracy: 0.7,
  domains: [
    {
      domainId: 'dom-security',
      uniqueFirstSolved: 12,
      gradedAttempts: 30,
      cumulativeAccuracy: 0.75,
      recentAccuracy: 0.6,
      status: 'ok',
    },
    {
      domainId: 'dom-cost-optimization',
      uniqueFirstSolved: 8,
      gradedAttempts: 15,
      cumulativeAccuracy: 0.5,
      recentAccuracy: 0.4,
      status: 'insufficient-data',
    },
  ],
  weakDomains: [
    {
      domainId: 'dom-cost-optimization',
      score: 0.45,
      cumulativeAccuracy: 0.5,
      effectiveRecentAccuracy: 0.4,
      uniqueFirstSolved: 8,
    },
  ],
};

Given('학습 현황 탭 API 모의가 준비되면', async ({ page }) => {
  statsGetCount = 0;
  // 포커스가 선택 탭과 어긋난 순간을 기록한다 (선택 커밋 전 포커스 이동 검출 — §6-2).
  await page.addInitScript(() => {
    const w = window as unknown as { __moiFocusMismatch?: string[] };
    w.__moiFocusMismatch = [];
    const original = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function patched(
      this: HTMLElement,
      ...args: Parameters<HTMLElement['focus']>
    ) {
      original.apply(this, args);
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active.getAttribute('role') !== 'tab') return;
      const selected = document.querySelector('[role="tab"][aria-selected="true"]');
      if (selected !== active) {
        const selectedId = selected instanceof HTMLElement ? selected.id : 'none';
        w.__moiFocusMismatch?.push(
          `focused=${active.id || active.textContent?.trim() || '?'} selected=${selectedId}`,
        );
      }
    };
  });
  await page.route('**/api/me', async (route) => {
    await route.fulfill({ status: 200, json: { user: { id: 'e2e-user-1' } } });
  });
  await page.route('**/api/study/stats**', async (route) => {
    statsGetCount += 1;
    await route.fulfill({ status: 200, json: STATS_DTO });
  });
  await page.route('**/api/study/sets**', async (route) => {
    const url = new URL(route.request().url());
    const listPath = url.pathname === '/api/study/sets';
    if (route.request().method() === 'GET' && (listPath || url.searchParams.has('page'))) {
      const p = Number(url.searchParams.get('page') ?? '1');
      await route.fulfill({ status: 200, json: { items: historyItems(p), total: TOTAL } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
});

When('학습 현황 화면으로 이동한다', async ({ page }) => {
  await page.goto('/history');
});

When('{string} 탭 주소로 이동한다', async ({ page }, tab: string) => {
  const slug = tab === '요약' ? 'summary' : tab === '영역별분석' ? 'domains' : 'completed';
  await page.goto(`/history?tab=${slug}`);
});

When('영역별 분석 탭 주소로 직접 이동한다', async ({ page }) => {
  await page.goto('/history?tab=domains');
});

When('완료 탭 주소로 직접 이동한다', async ({ page }) => {
  await page.goto('/history?tab=completed');
});

When('잘못된 탭 주소로 이동한다', async ({ page }) => {
  await page.goto('/history?tab=unknown');
});

When('페이지 지정 주소로 이동한다', async ({ page }) => {
  await page.goto('/history?page=2');
});

When('완료 탭의 2페이지에 머문다', async ({ page }) => {
  await page.goto('/history?tab=completed&page=2');
  await expect(page.getByText('현재 2 / 전체 3')).toBeVisible();
});

When('요약 탭을 누른다', async ({ page }) => {
  await page.getByRole('tab', { name: copy.history.tabSummary }).click();
});

When('영역별 분석 탭을 누른다', async ({ page }) => {
  await page.getByRole('tab', { name: copy.history.tabDomains }).click();
});

When('뒤로가기를 실행하면', async ({ page }) => {
  await page.goBack();
});

When('요약 탭에 포커스를 두고 오른쪽 방향키를 누른다', async ({ page }) => {
  const tabEl = page.getByRole('tab', { name: copy.history.tabSummary });
  await tabEl.focus();
  await page.keyboard.press('ArrowRight');
});

When('끝 키를 누른다', async ({ page }) => {
  await page.keyboard.press('End');
});

When('처음 키를 누른다', async ({ page }) => {
  await page.keyboard.press('Home');
});

Then('요약 탭이 활성 상태다', async ({ page }) => {
  await expect(page.getByRole('tab', { name: copy.history.tabSummary })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

Then('분석 탭이 활성 상태다', async ({ page }) => {
  await expect(page.getByRole('tab', { name: copy.history.tabDomains })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

Then('완료 탭이 활성 상태다', async ({ page }) => {
  await expect(page.getByRole('tab', { name: copy.history.tabCompleted })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

Then('요약 지표가 보인다', async ({ page }) => {
  await expect(page.getByText('20/500')).toBeVisible({ timeout: 10_000 });
});

Then('분석 패널과 완료 목록이 보이지 않는다', async ({ page }) => {
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByText(copy.stats.weakTitle)).toHaveCount(0);
  await expect(panel.getByText('총 45건')).toHaveCount(0);
});

Then('영역 4카드가 보인다', async ({ page }) => {
  const panel = page.getByRole('tabpanel');
  for (const label of ['보안', '복원력', '성능', '비용 최적화']) {
    await expect(panel.getByText(label).first()).toBeVisible({ timeout: 10_000 });
  }
  // 응답에 없는 2개 영역은 데이터 부족 카드다 (AC-9).
  await expect(panel.getByText(copy.history.noDomainHistory)).toHaveCount(2);
});

Then('취약 추천이 보인다', async ({ page }) => {
  await expect(page.getByRole('tabpanel').getByText(copy.stats.weakTitle)).toBeVisible({
    timeout: 10_000,
  });
});

Then('완료 목록이 보인다', async ({ page }) => {
  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  for (const label of [
    copy.history.completedColumnDate,
    copy.history.completedColumnScope,
    copy.history.completedColumnAccuracy,
    copy.history.completedColumnCount,
    copy.study.detail,
  ]) {
    await expect(table.getByRole('columnheader', { name: label })).toBeVisible();
  }
  // 값은 각자 셀에 들어 있다 (한 줄 텍스트로 뭉개지지 않는다).
  await expect(table.getByRole('cell').nth(2)).toHaveText(/^\d+%$/);
  await expect(table.getByRole('cell').nth(3)).toHaveText(/^\d+문제$/);
});

// 헤더와 각 행의 셀은 같은 컬럼(같은 x 좌표·폭)에 정렬된다.
Then('완료 목록의 헤더와 행 값이 같은 컬럼에 정렬된다', async ({ page }) => {
  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  const headerLefts = await table
    .locator('thead th')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  const rowLefts = await table
    .locator('tbody tr')
    .first()
    .locator('td')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  expect(headerLefts).toHaveLength(5);
  expect(rowLefts).toHaveLength(5);
  for (let i = 0; i < 5; i += 1) {
    expect(Math.abs(headerLefts[i] - rowLefts[i]), `${i}번째 컬럼 x 좌표`).toBeLessThanOrEqual(1);
  }
});

// 숫자 셀은 tabular-nums + 고정폭 서체, 오른쪽 기준선이다.
Then('숫자 셀은 고정폭 숫자 서체와 오른쪽 정렬을 쓴다', async ({ page }) => {
  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  for (const index of [0, 2, 3]) {
    const cell = table.getByRole('cell').nth(index);
    const cellStyle = await cell.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { variant: cs.fontVariantNumeric, align: cs.textAlign };
    });
    expect(cellStyle.variant, 'font-variant-numeric').toContain('tabular-nums');
    expect(cellStyle.align, '숫자 셀 정렬').toBe('right');
    const numFont = await cell
      .locator('.moi-history-num')
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(numFont.toLowerCase(), '숫자 서체').toMatch(/mono/);
  }
  // 한국어 범위명은 본문 서체를 유지한다.
  const scopeFont = await table
    .getByRole('cell')
    .nth(1)
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(scopeFont.toLowerCase(), '범위명 서체').not.toMatch(/mono/);
});

// 헤더와 셀의 정렬 기준이 컬럼마다 같다 (숫자 열은 둘 다 오른쪽).
Then('완료 목록 헤더와 셀의 정렬 기준이 같다', async ({ page }) => {
  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 10_000 });
  const headerAligns = await table
    .locator('thead th')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).textAlign));
  const cellAligns = await table
    .locator('tbody tr')
    .first()
    .locator('td')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).textAlign));
  expect(headerAligns).toHaveLength(5);
  expect(cellAligns).toHaveLength(5);
  for (let i = 0; i < 5; i += 1) {
    expect(headerAligns[i], `${i}번째 컬럼 정렬`).toBe(cellAligns[i]);
  }
  // 완료일·정답률·문항 수 열은 오른쪽 기준선이다.
  expect(cellAligns[0]).toBe('right');
  expect(cellAligns[2]).toBe('right');
  expect(cellAligns[3]).toBe('right');
});

// 좁은 화면에서는 표를 억지 축소하지 않고 라벨-값 카드로 재구성한다.
Then('좁은 화면에서는 라벨-값 카드가 보인다', async ({ page }) => {
  await expect(page.getByRole('table')).toHaveCount(0);
  const card = page.getByRole('listitem').first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  for (const label of [
    copy.history.completedColumnDate,
    copy.history.completedColumnScope,
    copy.history.completedColumnAccuracy,
    copy.history.completedColumnCount,
  ]) {
    await expect(card.getByRole('term').filter({ hasText: label })).toHaveCount(1);
  }
  await expect(card.getByRole('button', { name: /상세 보기/ })).toBeVisible();
});

Then('주소창의 탭 값이 요약이다', async ({ page }) => {
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('summary');
});

Then('주소창에 완료 탭이 명시된다', async ({ page }) => {
  await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('completed');
});

Then('2페이지 목록이 보인다', async ({ page }) => {
  await expect(page.getByText('현재 2 / 전체 3')).toBeVisible({ timeout: 10_000 });
});

Then('통계 요청이 1회만 전송된다', async ({ page }) => {
  await expect.poll(() => statsGetCount).toBe(1);
  // 단순 poll 통과가 아니라 정착 시간 뒤에도 1회인지 확인한다 (2회 이상이면 실패).
  await page.waitForTimeout(STATS_SETTLE_MS);
  expect(statsGetCount).toBe(1);
});

Then('포커스는 항상 선택된 탭과 일치한다', async ({ page }) => {
  // 선택 커밋 전에 포커스가 옮겨진 순간이 하나라도 있으면 실패다.
  const mismatches = await page.evaluate(() => {
    const w = window as unknown as { __moiFocusMismatch?: string[] };
    return w.__moiFocusMismatch ?? [];
  });
  expect(mismatches).toEqual([]);

  // 최종 상태에서도 focus == aria-selected 여야 한다.
  const state = await page.evaluate(() => {
    const active = document.activeElement;
    const selected = document.querySelector('[role="tab"][aria-selected="true"]');
    return {
      active: active instanceof HTMLElement ? active.id : null,
      selected: selected instanceof HTMLElement ? selected.id : null,
    };
  });
  expect(state.active).toBe(state.selected);
});
