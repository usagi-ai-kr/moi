import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { copy } from '../../src/ui/copy';

// 비동기 상태 BDD(#148) — 지연·실패·재시도 UI 검증용 결정적 모의.
// study.steps.ts의 page.route 분기 패턴을 최소 복제한다(공유 헬퍼 추출은 다른 PR과 충돌).
const { Given, When, Then } = createBdd();

interface FakeItem {
  questionId: string;
  questionVersionId: string;
  versionNo: number;
  optionOrder: string[];
  stem: string;
  options: Array<{ optionId: string; text: string }>;
  explanation: string;
  sourceUrls: string[];
  response: { kind: string; optionIds?: string[] };
}

interface FakeSet {
  id: string;
  status: 'active' | 'submitted' | 'abandoned';
  items: FakeItem[];
}

const STATS_DTO = {
  examId: 'saa-c03',
  totalQuestions: 500,
  uniqueFirstSolved: 0,
  coverage: 0,
  overallAccuracy: null,
  domains: [],
  weakDomains: [],
} as const;

const HISTORY_ITEMS = [
  {
    id: 'set-history-e2e-1',
    examId: 'saa-c03',
    mode: 'all',
    submittedAt: 1700000001000,
    correctCount: 10,
    accuracyPercent: 50,
  },
] as const;

let meDelayMs = 0;
let startDelayMs = 0;
let startFailStatus: number | null = null;
let startFailArmed = false;
let historyDelayMs = 0;
let historyFailStatus: number | null = null;
let historyFailArmed = false;
let submitDelayMs = 0;

let startPostCount = 0;
let submitPostCount = 0;
let activeSet: FakeSet | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freshSet(): FakeSet {
  const items: FakeItem[] = Array.from({ length: 20 }, (_, i) => {
    const optionIds = ['a', 'b', 'c', 'd'].map((suffix) => `q-${i}-${suffix}`);
    return {
      questionId: `q-${i}`,
      questionVersionId: `qv-${i}`,
      versionNo: 1,
      optionOrder: optionIds,
      stem: `문제 ${i} 본문: VPC와 서브넷 구성은?`,
      options: optionIds.map((id) => ({ optionId: id, text: `보기 ${id} 내용` })),
      explanation: `문제 ${i} 해설: 정답은 q-${i}-a이다.`,
      sourceUrls: [`https://docs.aws.amazon.com/q-${i}`],
      response: { kind: 'unanswered' },
    };
  });
  return { id: 'set-async-e2e-1', status: 'active', items };
}

function activeDto(s: FakeSet) {
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
      response: it.response,
    })),
  };
}

function submittedDto(s: FakeSet) {
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
  return {
    id: s.id,
    userId: 'e2e-user-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'submitted',
    createdAt: 1700000000000,
    submittedAt: 1700000001000,
    items: s.items,
    result: {
      answeredCount: 20 - passCount - unansweredCount,
      correctCount,
      accuracyPercent: Math.round((correctCount / 20) * 100),
      passCount,
      unansweredCount,
      perItem,
    },
  };
}

Given('비동기 상태 API 모의가 준비되면', async ({ page }) => {
  meDelayMs = 0;
  startDelayMs = 0;
  startFailStatus = null;
  startFailArmed = false;
  historyDelayMs = 0;
  historyFailStatus = null;
  historyFailArmed = false;
  submitDelayMs = 0;
  startPostCount = 0;
  submitPostCount = 0;
  activeSet = null;

  await page.route('**/api/me', async (route) => {
    if (meDelayMs > 0) await sleep(meDelayMs);
    await route.fulfill({ status: 200, json: { user: { id: 'e2e-user-1' } } });
  });

  await page.route('**/api/study/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    // 학습 현황(#54) — 이력 화면과 함께 뜨므로 오류 alert를 만들지 않도록 200으로 응답한다.
    if (method === 'GET' && path === '/api/study/stats') {
      await route.fulfill({ status: 200, json: STATS_DTO });
      return;
    }
    if (method === 'POST' && path === '/api/study/sets') {
      startPostCount += 1;
      if (startDelayMs > 0) await sleep(startDelayMs);
      if (startFailStatus !== null && startFailArmed) {
        startFailArmed = false;
        await route.fulfill({ status: startFailStatus, json: { error: 'server_error' } });
        return;
      }
      activeSet = freshSet();
      await route.fulfill({ status: 201, json: activeDto(activeSet) });
      return;
    }
    if (method === 'GET' && path === '/api/study/sets/current') {
      // /study는 서버 current로 진행 중 세트를 복원한다 (#148).
      if (activeSet && activeSet.status === 'active') {
        await route.fulfill({ status: 200, json: activeDto(activeSet) });
      } else {
        await route.fulfill({ status: 404, json: { error: 'no_active_set' } });
      }
      return;
    }
    if (method === 'GET' && path === '/api/study/sets') {
      if (historyDelayMs > 0) await sleep(historyDelayMs);
      if (historyFailStatus !== null && historyFailArmed) {
        historyFailArmed = false;
        await route.fulfill({ status: historyFailStatus, json: { error: 'server_error' } });
        return;
      }
      await route.fulfill({ status: 200, json: { items: HISTORY_ITEMS, total: HISTORY_ITEMS.length } });
      return;
    }
    if (method === 'GET' && /^\/api\/study\/sets\/[^/]+\/corrections$/.test(path)) {
      await route.fulfill({ status: 404, json: { error: 'not_found' } });
      return;
    }
    const m = path.match(/^\/api\/study\/sets\/([^/]+)(\/(answers|submit|abandon))?$/);
    if (m) {
      const id = m[1];
      const sub = m[3];
      const current = activeSet;
      if (!current || current.id !== id) {
        await route.fulfill({ status: 404, json: { error: 'not_found' } });
        return;
      }
      if (method === 'GET' && !sub) {
        await route.fulfill({
          status: 200,
          json: current.status === 'submitted' ? submittedDto(current) : activeDto(current),
        });
        return;
      }
      if (method === 'PATCH' && sub === 'answers') {
        let body: { questionId?: string; response?: FakeItem['response'] } | null = null;
        try {
          body = req.postDataJSON() as { questionId?: string; response?: FakeItem['response'] };
        } catch {
          body = null;
        }
        const item = current.items.find((i) => i.questionId === body?.questionId);
        if (!item || !body?.response) {
          await route.fulfill({ status: 404, json: { error: 'not_found' } });
          return;
        }
        item.response = body.response;
        await route.fulfill({ status: 200, json: { outcome: body.response.kind } });
        return;
      }
      if (method === 'POST' && sub === 'submit') {
        submitPostCount += 1;
        if (submitDelayMs > 0) await sleep(submitDelayMs);
        current.status = 'submitted';
        await route.fulfill({ status: 200, json: submittedDto(current) });
        return;
      }
      if (method === 'POST' && sub === 'abandon') {
        current.status = 'abandoned';
        await route.fulfill({ status: 200, json: activeDto(current) });
        return;
      }
    }
    await route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
});

Given('인증 확인 응답이 {int}ms 지연된다', async ({}, ms: number) => {
  meDelayMs = ms;
});

Given('세트 시작 응답이 {int}ms 지연된다', async ({}, ms: number) => {
  startDelayMs = ms;
});

Given('세트 시작 응답이 {int} 상태로 한 번 실패한다', async ({}, status: number) => {
  startFailStatus = status;
  startFailArmed = true;
});

Given('이력 응답이 {int}ms 지연된다', async ({}, ms: number) => {
  historyDelayMs = ms;
});

Given('이력 응답이 {int} 상태로 한 번 실패한다', async ({}, status: number) => {
  historyFailStatus = status;
  historyFailArmed = true;
});

Given('제출 응답이 {int}ms 지연된다', async ({}, ms: number) => {
  submitDelayMs = ms;
});

When('학습 시작 화면으로 이동한다', async ({ page }) => {
  await page.goto('/study/new');
});

When('이력 화면으로 이동한다', async ({ page }) => {
  await page.goto('/history');
});

When('시작 버튼을 연타하면', async ({ page }) => {
  const btn = page.getByRole('region', { name: copy.study.startTitle }).locator('button').first();
  // 대기 상태를 먼저 확인한 뒤 연타한다(대기 중 버튼은 disabled).
  await expect(btn).toBeDisabled();
  await btn.click({ force: true });
  await btn.click({ force: true });
  await btn.click({ force: true });
});

When('제출 확인 버튼을 연타하면', async ({ page }) => {
  const btn = page.getByRole('button', { name: copy.study.confirmSubmit });
  await expect(btn).toBeDisabled();
  await btn.click({ force: true });
  await btn.click({ force: true });
  await btn.click({ force: true });
});

When('재시도 버튼을 누르면', async ({ page }) => {
  await page
    .getByRole('region', { name: copy.study.historyTitle })
    .getByRole('button', { name: copy.session.retry })
    .click();
});

Then('인증 확인 중 상태가 보인다', async ({ page }) => {
  await expect(page.getByRole('status')).toContainText(copy.session.checking);
});

Then('로그인 홈 화면이 보인다', async ({ page }) => {
  await expect(page.getByRole('button', { name: copy.study.cta })).toBeVisible();
});

Then('시작 버튼이 대기 상태로 표시된다', async ({ page }) => {
  const btn = page.getByRole('region', { name: copy.study.startTitle }).locator('button').first();
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('aria-busy', 'true');
});

Then('세트 시작 요청이 1회만 전송된다', async () => {
  expect(startPostCount).toBe(1);
});

Then('시작 오류 안내가 보인다', async ({ page }) => {
  const alert = page.getByRole('region', { name: copy.study.startTitle }).getByRole('alert');
  await expect(alert).toContainText('시작하지 못했습니다');
  await expect(alert).toContainText('다시 시도해 주세요');
});

Then('시작 버튼이 다시 눌릴 수 있다', async ({ page }) => {
  const btn = page.getByRole('region', { name: copy.study.startTitle }).locator('button').first();
  await expect(btn).toBeEnabled();
});

Then('이력 로딩 상태가 보인다', async ({ page }) => {
  const section = page.getByRole('region', { name: copy.study.historyTitle });
  await expect(section.getByRole('status')).toContainText(copy.common.loading);
});

Then('이력 오류 안내와 재시도 버튼이 보인다', async ({ page }) => {
  const section = page.getByRole('region', { name: copy.study.historyTitle });
  await expect(section.getByRole('alert')).toContainText(copy.session.loadError);
  await expect(section.getByRole('button', { name: copy.session.retry })).toBeVisible();
});

Then('이력 목록이 보인다', async ({ page }) => {
  await expect(page.getByText(/정답률 50%/)).toBeVisible();
});

Then('제출 버튼이 대기 상태로 표시된다', async ({ page }) => {
  await expect(page.getByRole('button', { name: copy.study.confirmSubmit })).toBeDisabled();
  const submit = page.getByRole('button', { name: /제출하기/ });
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute('aria-busy', 'true');
});

Then('제출 요청이 1회만 전송된다', async () => {
  expect(submitPostCount).toBe(1);
});

Then('결과 화면 전 정답과 해설이 노출되지 않는다', async ({ page }) => {
  await expect(page.getByText('정답', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/해설: 정답은/)).toHaveCount(0);
  await expect(page.locator('[data-testid^="peritem-"]')).toHaveCount(0);
});
