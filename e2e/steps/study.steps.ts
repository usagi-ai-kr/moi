import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { copy } from '../../src/ui/copy';

// 학습 UI E2E route mock (#50) — 실제 백엔드 대신 결정적 10문제 세트를 제공한다.
// "API 모의가 준비되면"(auth.steps)과 충돌하지 않게 별도 문구를 사용한다.
const { Given, When, Then } = createBdd();

interface FakeItem {
  questionId: string;
  questionVersionId: string;
  versionNo: number;
  optionOrder: string[];
  stem: string;
  options: Array<{ optionId: string; text: string }>;
  answerCount: number;
  explanation: string;
  sourceUrls: string[];
  response: { kind: string; optionIds?: string[] };
}

let active: {
  id: string;
  status: string;
  items: FakeItem[];
  submittedAt?: number;
  result?: unknown;
} | null = null;

// 다음 PATCH /answers 1회만 실패시키는 플래그 (#52 오프라인 재연결 E2E).
let failNextAnswer = false;

// POST /abandon 호출 횟수 (#223 — 취소/Escape 0회·확정 1회 검증).
let abandonCalls = 0;

// 학습 현황 고정 응답 (#54) — saa-c03 요청에만 제공한다.
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
} as const;

function freshSet(): { id: string; status: string; items: FakeItem[]; submittedAt?: number; result?: unknown } {
  const items: FakeItem[] = Array.from({ length: 10 }, (_, i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`],
    stem: `문제 ${i} 본문: VPC와 서브넷 구성은?`,
    options: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`].map((id) => ({ optionId: id, text: `보기 ${id} 내용` })),
    answerCount: 1,
    explanation: `문제 ${i} 해설: 정답은 q-${i}-a이다.`,
    sourceUrls: [`https://docs.aws.amazon.com/q-${i}`],
    response: { kind: 'unanswered' },
  }));
  return { id: 'set-e2e-1', status: 'active', items };
}

function toActiveDto(s: NonNullable<typeof active>) {
  return {
    id: s.id,
    userId: 'e2e-user-1',
    examId: 'saa-c03',
    mode: 'all',
    status: s.status,
    createdAt: 1700000000000,
    // 실제 API 계약과 동일: 제출 전에는 해설·근거를 제외한다.
    items: s.items.map((it) => ({
      questionId: it.questionId,
      questionVersionId: it.questionVersionId,
      versionNo: it.versionNo,
      optionOrder: it.optionOrder,
      stem: it.stem,
      options: it.options,
      answerCount: it.answerCount,
      response: it.response,
    })),
  };
}

function submittedDto(s: NonNullable<typeof active>) {
  const perItem = s.items.map((it) => {
    const selected = it.response.kind === 'answered' ? (it.response.optionIds ?? []) : [];
    const correctIds = [`${it.questionId}-a`];
    const correct = selected.length === 1 && selected[0] === correctIds[0];
    return {
      questionId: it.questionId,
      responseKind: it.response.kind,
      selectedOptionIds: selected,
      correctOptionIds: correctIds,
      correct,
    };
  });
  const correctCount = perItem.filter((p) => p.correct).length;
  const passCount = s.items.filter((i) => i.response.kind === 'pass').length;
  const unansweredCount = s.items.filter((i) => i.response.kind === 'unanswered').length;
  const result = {
    answeredCount: 10 - passCount - unansweredCount,
    correctCount,
    accuracyPercent: Math.round((correctCount / 10) * 100),
    passCount,
    unansweredCount,
    perItem,
  };
  return {
    id: s.id,
    userId: 'e2e-user-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'submitted',
    createdAt: 1700000000000,
    submittedAt: 1700000001000,
    items: s.items,
    result,
  };
}

Given('학습 API 모의가 준비되면', async ({ page }) => {
  active = null;
  failNextAnswer = false;
  abandonCalls = 0;
  await page.route('**/api/me', async (route) => {
    await route.fulfill({ status: 200, json: { user: { id: 'e2e-user-1' } } });
  });
  await page.route('**/api/study/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;
    // 학습 현황(#54) — 세트/이력 mock과 충돌하지 않도록 stats를 먼저 처리한다.
    if (method === 'GET' && path === '/api/study/stats') {
      if (url.searchParams.get('examId') !== 'saa-c03') {
        await route.fulfill({ status: 404, json: { error: 'not_found' } });
        return;
      }
      await route.fulfill({ status: 200, json: STATS_DTO });
      return;
    }
    // 진행 중 세트 복원(#148) — generic /sets/:id보다 먼저 처리한다.
    if (method === 'GET' && path === '/api/study/sets/current') {
      if (!active || active.status !== 'active') {
        await route.fulfill({ status: 404, json: { error: 'no_active_set' } });
        return;
      }
      await route.fulfill({ status: 200, json: toActiveDto(active) });
      return;
    }
    if (method === 'POST' && path === '/api/study/sets') {
      if (active && active.status === 'active') {
        await route.fulfill({ status: 409, json: { error: 'active_set_exists' } });
        return;
      }
      active = freshSet();
      const created = active;
      await route.fulfill({ status: 201, json: toActiveDto(created) });
      return;
    }
    // 완료 세트 정정 이력(#53) — generic /sets/:id regex보다 먼저 처리한다.
    if (method === 'GET') {
      const cm = path.match(/^\/api\/study\/sets\/([^/]+)\/corrections$/);
      if (cm) {
        const cid = cm[1];
        if (active && active.status === 'submitted' && active.id === cid) {
          await route.fulfill({
            status: 200,
            json: {
              items: [
                {
                  id: 'c-e2e-1',
                  setId: active.id,
                  questionId: 'q-0',
                  questionVersionId: 'qv-0',
                  reason: 'typo',
                  source: 'admin',
                  actor: 'system',
                  createdAt: 1700000002000,
                },
              ],
              corrected: {
                answeredCount: 9,
                correctCount: 0,
                accuracyPercent: 0,
                passCount: 0,
                unansweredCount: 9,
                ungraded: false,
                validTotal: 9,
                excludedCount: 1,
                excludedQuestionVersionIds: ['qv-0'],
                perItem: [],
              },
            },
          });
          return;
        }
        await route.fulfill({ status: 404, json: { error: 'not_found' } });
        return;
      }
    }
    const m = path.match(/^\/api\/study\/sets\/([^/]+)(\/(answers|submit|abandon))?$/);
    if (m) {
      const id = m[1];
      const sub = m[3];
      if (!active || active.id !== id) {
        await route.fulfill({ status: 404, json: { error: 'not_found' } });
        return;
      }
      if (method === 'GET' && !sub) {
        await route.fulfill({ status: 200, json: active.status === 'submitted' ? submittedDto(active) : toActiveDto(active) });
        return;
      }
      if (method === 'PATCH' && sub === 'answers') {
        // 일시 실패 모의 — 서버 상태(active.items[].response)는 건드리지 않는다 (#52).
        if (failNextAnswer) {
          failNextAnswer = false;
          await route.abort('failed');
          return;
        }
        let body: { questionId?: string; response?: FakeItem['response'] } | null = null;
        try {
          body = req.postDataJSON() as { questionId?: string; response?: FakeItem['response'] };
        } catch {
          body = null;
        }
        const item = active.items.find((i) => i.questionId === body?.questionId);
        if (!item || !body?.response) {
          await route.fulfill({ status: 404, json: { error: 'not_found' } });
          return;
        }
        item.response = body.response;
        await route.fulfill({ status: 200, json: { outcome: body.response.kind } });
        return;
      }
      if (method === 'POST' && sub === 'submit') {
        let body: { confirmUnanswered?: boolean } | null = null;
        try {
          body = req.postDataJSON() as { confirmUnanswered?: boolean };
        } catch {
          body = null;
        }
        const hasUnanswered = active.items.some((i) => i.response.kind === 'unanswered');
        if (hasUnanswered && body?.confirmUnanswered !== true) {
          await route.fulfill({ status: 422, json: { error: 'unanswered_not_confirmed' } });
          return;
        }
        active.status = 'submitted';
        active.submittedAt = 1700000001000;
        active.result = true;
        await route.fulfill({ status: 200, json: submittedDto(active) });
        return;
      }
      if (method === 'POST' && sub === 'abandon') {
        abandonCalls += 1;
        active.status = 'abandoned';
        await route.fulfill({ status: 200, json: toActiveDto(active) });
        return;
      }
    }
    if (method === 'GET' && path === '/api/study/sets') {
      const items =
        active && active.status === 'submitted'
          ? [
              {
                id: active.id,
                examId: 'saa-c03',
                mode: 'all',
                submittedAt: 1700000001000,
                correctCount: 1,
                accuracyPercent: 10,
              },
            ]
          : [];
      await route.fulfill({ status: 200, json: { items, total: items.length } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
});

Given('답안 저장이 일시 실패하도록 준비되면', async () => {
  failNextAnswer = true;
});

When('10문제 학습 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: '10문제 학습' }).click();
});

When('학습 시작 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: '학습 시작' }).click();
});

When('첫 번째 보기를 선택하면', async ({ page }) => {
  await page.getByLabel(/보기 1/).first().click();
});

When('제출하기 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: /제출하기/ }).click();
});

When('제출을 확인하면', async ({ page }) => {
  await page.getByRole('button', { name: '제출 확인' }).click();
});

When('포기하기 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: '포기하기' }).click();
});

When('포기를 확인하면', async ({ page }) => {
  await page.getByRole('button', { name: '포기 확인' }).click();
});

When('포기 취소를 누르면', async ({ page }) => {
  await page.getByRole('button', { name: '취소' }).click();
});

When('Escape 키를 누르면', async ({ page }) => {
  await page.keyboard.press('Escape');
});

When('텍스트를 200%로 확대하면', async ({ page }) => {
  // #223 AC5 — 텍스트 200% 확대(브라우저 확대 모의, Chromium zoom).
  await page.evaluate(() => {
    document.documentElement.style.setProperty('zoom', '2');
  });
});

Then('포기 요청이 {int}회 발생했다', async ({}, count: number) => {
  expect(abandonCalls).toBe(count);
});

Then('포기 확인이 보인다', async ({ page }) => {
  await expect(page.getByRole('alertdialog', { name: copy.study.abandonTitle })).toBeVisible();
  await expect(page.getByText(copy.study.abandonDesc)).toBeVisible();
});

Then('포기 확인 레이아웃이 깨지지 않는다', async ({ page }) => {
  // #223 AC5 — 실제 bbox로 문구/버튼 겹침·잘림·뷰포트 이탈을 검증한다(jsdom 금지).
  const layout = await page.evaluate(() => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const dialog = document.querySelector('[role="alertdialog"]');
    const boxes = {
      dialog: rect(dialog),
      title: rect(dialog?.querySelector('h2') ?? null),
      desc: rect(dialog?.querySelector('p') ?? null),
      cancel: null as { x: number; y: number; w: number; h: number } | null,
      confirm: null as { x: number; y: number; w: number; h: number } | null,
    };
    for (const b of dialog?.querySelectorAll('button') ?? []) {
      const name = b.textContent?.trim() ?? '';
      if (name === '취소') boxes.cancel = rect(b);
      if (name === '포기 확인') boxes.confirm = rect(b);
    }
    return { boxes, vw: window.innerWidth, vh: window.innerHeight };
  });
  const { boxes, vw, vh } = layout;
  for (const [k, b] of Object.entries(boxes)) {
    expect(b, k).not.toBeNull();
    expect(b!.w, `${k} width`).toBeGreaterThan(0);
    expect(b!.h, `${k} height`).toBeGreaterThan(0);
    expect(b!.x, `${k} left`).toBeGreaterThanOrEqual(0);
    expect(b!.x + b!.w, `${k} right`).toBeLessThanOrEqual(vw + 1);
    expect(b!.y, `${k} top`).toBeGreaterThanOrEqual(0);
    expect(b!.y + b!.h, `${k} bottom`).toBeLessThanOrEqual(vh + 1);
  }
  // 버튼은 44px 이상(#223 AC2·AC5).
  expect(boxes.cancel!.h, 'cancel height').toBeGreaterThanOrEqual(44 - 1);
  expect(boxes.confirm!.h, 'confirm height').toBeGreaterThanOrEqual(44 - 1);
  const overlap = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  expect(overlap(boxes.title!, boxes.desc!)).toBe(0);
  expect(overlap(boxes.title!, boxes.cancel!)).toBe(0);
  expect(overlap(boxes.title!, boxes.confirm!)).toBe(0);
  expect(overlap(boxes.desc!, boxes.cancel!)).toBe(0);
  expect(overlap(boxes.desc!, boxes.confirm!)).toBe(0);
  expect(overlap(boxes.cancel!, boxes.confirm!)).toBe(0);
  await expect(page.getByRole('button', { name: '취소' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '포기 확인' })).toBeEnabled();
});

When('학습 이력 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: '학습 이력' }).click();
});

// #224: /history 기본 탭이 요약이므로 완료 목록은 탭 클릭 후에만 보인다 (AC-4).
When('완료한 학습 탭을 누르면', async ({ page }) => {
  await page.getByRole('tab', { name: '완료한 학습' }).click();
});

When('학습 현황 버튼을 누르면', async ({ page }) => {
  await page.getByRole('link', { name: '학습 현황/이력' }).click();
});

Then('학습 범위 선택이 보인다', async ({ page }) => {
  await expect(page.getByText('학습 범위 선택')).toBeVisible();
});

Then('문제 화면이 보인다', async ({ page }) => {
  await expect(page.getByText(/1\/10/)).toBeVisible();
});

Then('주소창에 내부 세트 ID가 없다', async ({ page }) => {
  const url = page.url();
  expect(url).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(new URL(url).pathname).toMatch(/^(\/study(\/new|\/result)?|\/history(\/detail)?)$/);
});

Then('문제 본문과 보기가 보인다', async ({ page }) => {
  await expect(page.getByText('문제 0 본문: VPC와 서브넷 구성은?')).toBeVisible();
  await expect(page.getByText('1. 보기 q-0-a 내용')).toBeVisible();
});

Then('오프라인 임시 저장이 보인다', async ({ page }) => {
  await expect(page.getByText('오프라인 임시 저장')).toBeVisible({ timeout: 10_000 });
});

When('네트워크가 복구되면', async ({ page }) => {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
});

Then('저장됨 표시가 보인다', async ({ page }) => {
  await expect(page.getByText('저장됨')).toBeVisible({ timeout: 10_000 });
});

Then('미응답 확인이 보인다', async ({ page }) => {
  await expect(page.getByText(/풀지 않은 문제/)).toBeVisible();
});

Then('학습 결과가 보인다', async ({ page }) => {
  await expect(page.getByText('학습 결과')).toBeVisible({ timeout: 10_000 });
});

Then('해설과 근거가 보인다', async ({ page }) => {
  await expect(page.getByText(/문제 0 해설: 정답은/)).toBeVisible();
  const source = page.getByRole('link', { name: 'Q 0' });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('href', 'https://docs.aws.amazon.com/q-0');
  await expect(source).toHaveAttribute('title', 'https://docs.aws.amazon.com/q-0');
});

Then('완료 세트가 보인다', async ({ page }) => {
  await expect(page.getByText('완료한 학습')).toBeVisible({ timeout: 10_000 });
});

When('이력 항목을 선택하면', async ({ page }) => {
  // #224 추가 피드백: 완료 목록은 컬럼 표 — 행의 상세 보기 액션으로 상세를 연다.
  await page.getByRole('button', { name: /상세 보기/ }).first().click();
});

When('상세 보기 링크를 누르면', async ({ page }) => {
  await page.getByRole('link', { name: '상세 보기' }).click();
});

Then('학습 현황이 보인다', async ({ page }) => {
  // #224: 요약 탭(기본)에 지표를, 분석 탭에 취약 추천을 보인다.
  const panel = page.locator('section.moi-stats');
  await expect(panel.getByText('20/500')).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText(/70%/)).toBeVisible();
  await page.getByRole('tab', { name: '영역별 분석' }).click();
  await expect(page.getByRole('tabpanel').getByText('취약 추천')).toBeVisible();
});

Then('정정 반영이 보인다', async ({ page }) => {
  const panel = page.locator('section.moi-study-detail');
  await expect(panel.getByText('정정 반영')).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText('최초 정답률 10% → 정정 정답률 0%')).toBeVisible();
  await expect(panel.getByText('유효 9문제 · 제외 1문제')).toBeVisible();
  await expect(panel.getByText('문제 1 · 오탈자가 있습니다')).toBeVisible();
});

// #148 5항 — 실제 브라우저 계산 스타일로 버튼 크기·outline 테두리 회귀를 막는다.
Then('풀이 버튼은 44px 이상이고 북마크 버튼 테두리가 보인다', async ({ page }) => {
  for (const name of ['Pass', '미응답으로 지우기', '다음', /제출하기/, '포기하기']) {
    const box = await page.getByRole('button', { name }).first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const bookmark = page.getByRole('button', { name: /북마크/ }).first();
  await expect(bookmark).toBeVisible();
  const width = await bookmark.evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(width).toBe('1px');
});

// #189 결과 해설 페이저 — 진행 표시는 페이저 영역 안에서만 찾는다(요약의 "정답 1/10"과 구분).
function resultPager(page: import('@playwright/test').Page) {
  return page.getByRole('group', { name: copy.study.resultPagerLabel });
}

When('결과 다음 문항 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: copy.study.nextItem }).click();
});

When('결과 이전 문항 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: copy.study.prevItem }).click();
});

When('결과 다음 문항 버튼에 포커스를 두고 오른쪽 방향키를 누르면', async ({ page }) => {
  const button = page.getByRole('button', { name: copy.study.nextItem });
  await expect(button).toBeEnabled();
  // locator.press가 focus+key를 원자적으로 수행 — 제출 후 재렌더 사이 focus 유실 flake 방지. 재시도 없이 1회만 press (중복 press 전진 방지).
  await button.press('ArrowRight');
  const status = resultPager(page).locator('.moi-study-pager-status');
  try {
    await expect(status).toHaveText(new RegExp(`2/\\d+`));
  } catch {
    const actual = await status.textContent().catch(() => null);
    throw new Error(`결과 진행 표시가 2번째 문항으로 바뀌지 않았다 (실제: ${actual ?? '조회 실패'})`);
  }
});

Then('결과 해설 카드는 1개만 보인다', async ({ page }) => {
  await expect(page.locator('[data-testid^="peritem-"]')).toHaveCount(1);
});

Then('결과 진행 표시가 {int}번째 문항이다', async ({ page }, position: number) => {
  const status = resultPager(page).locator('.moi-study-pager-status');
  await expect(status).toHaveText(new RegExp(`${position}/\\d+`));
});

Then('결과 이전 문항 버튼은 비활성 상태다', async ({ page }) => {
  await expect(page.getByRole('button', { name: copy.study.prevItem })).toBeDisabled();
});
