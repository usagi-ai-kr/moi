// #215 — 모바일 Drawer·반응형 BDD 스텝. 실제 계정·D1·인증 조작 없이 결정적 route mock만 사용한다.
import { expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

const MENU_LABELS = ['학습 시작', '학습 현황/이력', '복습', '계정'];

const STATS_DTO = {
  examId: 'saa-c03',
  totalQuestions: 500,
  uniqueFirstSolved: 20,
  coverage: 0.04,
  overallAccuracy: 0.7,
  domains: [],
  weakDomains: [],
} as const;

Given('모바일 내비게이션 API 모의가 준비되면', async ({ page }) => {
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      json: { user: { id: 'e2e-user-1', createdAt: 1_700_000_000, lastLoginAt: 1_700_100_000 } },
    });
  });
  await page.route('**/api/study/stats**', async (route) => {
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
});

When('{string} 화면에 접속하면', async ({ page }, route: string) => {
  await page.goto(route);
});

When('햄버거 메뉴를 누른다', async ({ page }) => {
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  const drawer = page.locator('dialog.moi-drawer');
  await expect(drawer).toBeVisible();
  await settleDrawer(page);
});

When('Drawer 닫기 버튼을 누른다', async ({ page }) => {
  await page.getByRole('button', { name: '메뉴 닫기' }).click();
});

When('Drawer 바깥을 클릭한다', async ({ page }) => {
  // Drawer는 화면 우측에 있으므로 좌측 여백이 백드롭이다.
  await page.mouse.click(8, 200);
});

When('Escape 키를 누른다', async ({ page }) => {
  await page.keyboard.press('Escape');
});

When('Drawer에서 {string} 메뉴를 선택한다', async ({ page }, label: string) => {
  await page.locator('dialog.moi-drawer').getByRole('link', { name: label }).click();
});

When('뷰포트를 {int}x{int}으로 바꾼다', async ({ page }, width: number, height: number) => {
  await page.setViewportSize({ width, height });
});

When('200% 확대를 흉내내면', async ({ page }) => {
  // 브라우저 200% 확대는 CSS 뷰포트가 절반이 되는 것과 같다 (1280 → 640).
  await page.setViewportSize({ width: 640, height: 400 });
});

When('Drawer 텍스트를 200%로 확대한다', async ({ page }) => {
  await page.addStyleTag({
    content: '.moi-drawer-link, .moi-drawer-head, .moi-logout-action { font-size: 200% !important; }',
  });
});

Then('브랜드와 햄버거 버튼이 보인다', async ({ page }) => {
  await expect(page.locator('header.moi-shell-header')).toBeVisible();
  await expect(page.getByRole('link', { name: 'moi' })).toBeVisible();
  await expect(page.getByRole('button', { name: '메뉴 열기' })).toBeVisible();
});

Then('가로 메뉴 링크는 화면에서 숨겨진다', async ({ page }) => {
  const nav = page.locator('nav.moi-nav');
  await expect(nav).toBeHidden();
  await expect(page.getByRole('link', { name: '학습 현황/이력' }).first()).toBeHidden();
});

Then('가로 메뉴 링크가 보인다', async ({ page }) => {
  const nav = page.locator('nav.moi-nav');
  await expect(nav).toBeVisible();
  for (const label of MENU_LABELS) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
});

Then('햄버거 버튼은 보이지 않는다', async ({ page }) => {
  await expect(page.getByRole('button', { name: '메뉴 열기' })).toBeHidden();
});

Then('Drawer에 네 메뉴가 보인다', async ({ page }) => {
  const drawer = page.locator('dialog.moi-drawer');
  await expect(drawer).toBeVisible();
  const links = drawer.getByRole('link');
  await expect(links).toHaveCount(4);
  for (const label of MENU_LABELS) {
    await expect(drawer.getByRole('link', { name: label })).toBeVisible();
  }
});

// 로그아웃은 Drawer 안의 독립 액션 버튼이다 — 링크 4개와 구분된다(#234/ADR-0072).
Then('Drawer에 로그아웃 액션이 보인다', async ({ page }) => {
  const drawer = page.locator('dialog.moi-drawer');
  const button = drawer.getByRole('button', { name: '로그아웃' });
  await expect(button).toBeVisible();
  await expect(drawer.getByRole('link', { name: '로그아웃' })).toHaveCount(0);
  await expect(drawer.getByRole('link')).toHaveCount(4);
});

Then('현재 위치 메뉴가 표시된다', async ({ page }) => {
  const current = page.locator('dialog.moi-drawer a[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText('학습 시작');
});

Then('Drawer 항목은 44px 이상이다', async ({ page }) => {
  const drawer = page.locator('dialog.moi-drawer');
  for (const selector of ['.moi-drawer-close', '.moi-drawer-link', '.moi-logout-action']) {
    const boxes = await drawer.locator(selector).evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { w: rect.width, h: rect.height };
      }),
    );
    for (const box of boxes) {
      expect(box.h, `${selector} 높이`).toBeGreaterThanOrEqual(44);
      expect(box.w, `${selector} 너비`).toBeGreaterThanOrEqual(44);
    }
  }
});

Then('Drawer가 닫힌다', async ({ page }) => {
  await expect(page.locator('dialog.moi-drawer')).toBeHidden();
});

Then('포커스가 햄버거 버튼으로 돌아온다', async ({ page }) => {
  const active = await page.evaluate(() => document.activeElement?.className ?? '');
  expect(active).toContain('moi-drawer-trigger');
});

Then('배경 스크롤이 잠겨 있다', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.style.overflow);
  expect(overflow).toBe('hidden');
});

Then('배경 스크롤이 풀려 있다', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.style.overflow);
  expect(overflow).toBe('');
});

Then('주소창이 {string}로 바뀐다', async ({ page }, path: string) => {
  await expect(page).toHaveURL(new RegExp(`${path}$`));
});

Then('메뉴 링크가 키보드 탐색에 중복 노출되지 않는다', async ({ page }) => {
  const seen = await tabOrder(page, 25);
  for (const label of MENU_LABELS) {
    const count = seen.filter((text) => text.includes(label)).length;
    expect(count, `${label} 키보드 노출 ${count}회`).toBeLessThanOrEqual(1);
  }
});

Then('헤더가 화면 높이의 {int}% 이내이다', async ({ page }, percent: number) => {
  const ratio = await page.evaluate(() => {
    const header = document.querySelector('header.moi-shell-header');
    if (!header) return 0;
    return (header.getBoundingClientRect().height / window.innerHeight) * 100;
  });
  expect(ratio).toBeLessThanOrEqual(percent);
});

Then('주요 컨트롤이 화면 안에 있고 가려지지 않는다', async ({ page }) => {
  expect(await occlusionIssues(page, 'body')).toEqual([]);
});

Then('Drawer 안의 항목이 화면 안에 있고 가려지지 않는다', async ({ page }) => {
  expect(await occlusionIssues(page, 'dialog.moi-drawer')).toEqual([]);
});

/** 지정 컨테이너 안의 가시 컨트롤이 화면 밖이거나 다른 요소에 가려지는지 검사한다. */
async function occlusionIssues(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${
        el.className && typeof el.className === 'string'
          ? `.${el.className.split(' ').filter(Boolean).join('.')}`
          : ''
      }`;
    const problems: string[] = [];
    const root = document.querySelector(selector) ?? document.body;
    const nodes = Array.from(
      root.querySelectorAll('button, a[href], input, select, textarea, [role="button"]'),
    );
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (rect.left < -1 || rect.right > vw + 1) {
        problems.push(
          `화면 밖: ${describe(el)} (left=${Math.round(rect.left)}, right=${Math.round(rect.right)}, vw=${vw})`,
        );
        continue;
      }
      // 화면 안에 보이는 요소만 히트 테스트한다 (스크롤 아래 요소는 제외).
      if (rect.top < 0 || rect.bottom > vh) continue;
      const x = Math.min(Math.max(rect.left + rect.width / 2, 0), vw - 1);
      const y = Math.min(Math.max(rect.top + rect.height / 2, 0), vh - 1);
      const hit = document.elementFromPoint(x, y);
      if (hit && !(el.contains(hit) || hit.contains(el))) {
        problems.push(`가려짐: ${describe(el)} → ${describe(hit)}`);
      }
    }
    return problems;
  }, scope);
}

/** 슬라이드 인 트랜지션이 끝날 때까지 기다린다 (측정 흔들림 방지). */
async function settleDrawer(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const drawer = document.querySelector('dialog.moi-drawer');
    if (!drawer) return true;
    const transform = getComputedStyle(drawer).transform;
    return transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';
  });
}

/** 한 번의 포커스 순환(cycle) 동안 방문한 요소의 라벨을 모은다. */
async function tabOrder(page: Page, max: number): Promise<string[]> {
  await page.evaluate(() => {
    document.querySelectorAll('[data-bdd-tab-seen]').forEach((el) => {
      el.removeAttribute('data-bdd-tab-seen');
    });
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const seen: string[] = [];
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const result = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement) {
        return { repeat: true, text: '' };
      }
      const repeat = el.hasAttribute('data-bdd-tab-seen');
      el.setAttribute('data-bdd-tab-seen', '1');
      if (!['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
        return { repeat, text: '' };
      }
      return { repeat, text: (el.getAttribute('aria-label') || el.textContent || '').trim() };
    });
    if (result.repeat) break;
    if (result.text) seen.push(result.text);
  }
  return seen;
}
