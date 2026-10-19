import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

// 학습 UI E2E route mock (#50) — 실제 백엔드 대신 결정적 20문제 세트를 제공한다.
// "API 모의가 준비되면"(auth.steps)과 충돌하지 않게 별도 문구를 사용한다.
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

let active: {
  id: string;
  status: string;
  items: FakeItem[];
  submittedAt?: number;
  result?: unknown;
} | null = null;

// 다음 PATCH /answers 1회만 실패시키는 플래그 (#52 오프라인 재연결 E2E).
let failNextAnswer = false;

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
      domainId: 'dom-cost',
      uniqueFirstSolved: 8,
      gradedAttempts: 15,
      cumulativeAccuracy: 0.5,
      recentAccuracy: 0.4,
      status: 'insufficient-data',
    },
  ],
  weakDomains: [
    {
      domainId: 'dom-cost',
      score: 0.45,
      cumulativeAccuracy: 0.5,
      effectiveRecentAccuracy: 0.4,
      uniqueFirstSolved: 8,
    },
  ],
} as const;

function freshSet(): { id: string; status: string; items: FakeItem[]; submittedAt?: number; result?: unknown } {
  const items: FakeItem[] = Array.from({ length: 20 }, (_, i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`],
    stem: `문제 ${i} 본문: VPC와 서브넷 구성은?`,
    options: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`].map((id) => ({ optionId: id, text: `보기 ${id} 내용` })),
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
    answeredCount: 20 - passCount - unansweredCount,
    correctCount,
    accuracyPercent: Math.round((correctCount / 20) * 100),
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
                answeredCount: 19,
                correctCount: 0,
                accuracyPercent: 0,
                passCount: 0,
                unansweredCount: 19,
                ungraded: false,
                validTotal: 19,
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
                accuracyPercent: 5,
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

When('20문제 학습 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: '20문제 학습' }).click();
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

When('학습 이력 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: '학습 이력' }).click();
});

When('학습 현황 버튼을 누르면', async ({ page }) => {
  await page.getByRole('link', { name: '학습 현황/이력' }).click();
});

Then('학습 범위 선택이 보인다', async ({ page }) => {
  await expect(page.getByText('학습 범위 선택')).toBeVisible();
});

Then('문제 화면이 보인다', async ({ page }) => {
  await expect(page.getByText(/1\/20/)).toBeVisible();
});

Then('주소창에 내부 세트 ID가 없다', async ({ page }) => {
  const url = page.url();
  expect(url).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(new URL(url).pathname).toMatch(/^\/study(\/new|\/result)?$/);
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
  await expect(page.getByRole('link', { name: /docs.aws.amazon.com/ }).first()).toBeVisible();
});

Then('포기 확인이 보인다', async ({ page }) => {
  await expect(page.getByText(/정말 포기할까요/)).toBeVisible();
});

Then('완료 세트가 보인다', async ({ page }) => {
  await expect(page.getByText('완료한 학습')).toBeVisible({ timeout: 10_000 });
});

Then('학습 현황이 보인다', async ({ page }) => {
  const panel = page.locator('section.moi-stats');
  await expect(panel.getByText('20/500')).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText(/70%/)).toBeVisible();
  await expect(panel.getByText('취약 추천')).toBeVisible();
});

Then('정정 반영이 보인다', async ({ page }) => {
  const panel = page.locator('section.moi-study-detail');
  await expect(panel.getByText('정정 반영')).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText('최초 정답률 5% → 정정 정답률 0%')).toBeVisible();
  await expect(panel.getByText('유효 19문제 · 제외 1문제')).toBeVisible();
  await expect(panel.getByText('문제 1 · 오탈자가 있습니다')).toBeVisible();
});
