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
    return {
      id: `set-e2e-${i}`,
      examId: 'saa-c03',
      mode: 'all',
      submittedAt: 1700000000000 + i * 1000,
      correctCount: 10,
      accuracyPercent: 50,
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
  await expect(page.getByText(/정답률 50%/).first()).toBeVisible({ timeout: 10_000 });
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
