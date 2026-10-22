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
    correctCount: 5,
    accuracyPercent: 50,
  },
] as const;

let meDelayMs = 0;
let startDelayMs = 0;
let startFailStatus: number | null = null;
let startFailArmed = false;
// #270 차단3 응답 유실 모드: 첫 POST는 서버에 세트를 남기고 응답을 유실(abort)한다. 재시도는 409.
let startLoseArmed = false;
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
  const items: FakeItem[] = Array.from({ length: 10 }, (_, i) => {
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
      answeredCount: 10 - passCount - unansweredCount,
      correctCount,
      accuracyPercent: Math.round((correctCount / 10) * 100),
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
  startLoseArmed = false;
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
      // #270 차단3 응답 유실: 첫 요청은 서버에 세트를 남기고 응답을 유실한다. 재시도는 409.
      if (startLoseArmed) {
        if (startPostCount === 1) {
          activeSet = freshSet();
          await route.abort('connectionaborted');
          return;
        }
        await route.fulfill({ status: 409, json: { error: 'active_set_exists' } });
        return;
      }
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

Given('세트 시작 첫 응답이 유실되고 서버에는 활성 세트가 남는다', async ({}) => {
  startLoseArmed = true;
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

When('이력 화면으로 이동한다', async ({ page }) => {
  // #224: 기본 탭이 요약으로 바뀌어 이력 시나리오는 완료 탭으로 진입한다.
  await page.goto('/history?tab=completed');
});

When('대기 중 시작 버튼에 키보드 입력을 보내면', async ({ page }) => {
  const btn = page.getByRole('region', { name: copy.study.startTitle }).locator('button').first();
  // 중복 방지의 실제 근거: 대기 중에는 disabled+aria-busy라 클릭·키 활성화가 발생하지 않는다.
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('aria-busy', 'true');
  // 약한 검증 보완(#270-r2): 실제 시작 버튼에 포커스를 시도한 뒤 Enter/Space.
  // disabled라 포커스가 가지 않아야 하며 키 입력으로도 활성화되지 않는다.
  // Tab 순회 뒤 초점이 링크 등에 남아 있으면 Enter가 내비게이션을 유발하므로
  // 포커스 시도·미포커스 확인 뒤 body로 blur하고 키를 보낸다.
  await btn.focus().catch(() => {});
  await expect(btn).not.toBeFocused();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  // disabled 버튼은 Enter/Space로도 활성화되지 않아야 한다(브라우저 기본 동작 확인).
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
});

When('대기 중 제출 확인 버튼에 키보드 입력을 보내면', async ({ page }) => {
  const btn = page.getByRole('button', { name: copy.study.confirmSubmit });
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('aria-busy', 'true');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
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
  await expect.poll(() => startPostCount).toBe(1);
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
  // #224 추가 피드백: 완료 목록은 컬럼 표 — 정답률 값이 정답률 컬럼 셀에 보인다.
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('cell').filter({ hasText: /^\d+%$/ }).first()).toBeVisible();
});

Then('제출 버튼이 대기 상태로 표시된다', async ({ page }) => {
  await expect(page.getByRole('button', { name: copy.study.confirmSubmit })).toBeDisabled();
  const submit = page.getByRole('button', { name: /제출하기/ });
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute('aria-busy', 'true');
});

Then('제출 요청이 1회만 전송된다', async () => {
  await expect.poll(() => submitPostCount).toBe(1);
});

Then('결과 화면 전 해설과 문항별 결과가 노출되지 않는다', async ({ page }) => {
  // 제출 전 DTO에 해설·문항별 정오답이 없어야 한다(정답 문구 자체는 DTO에 없어 자명하므로 제외).
  await expect(page.getByText(/해설: 정답은/)).toHaveCount(0);
  await expect(page.locator('[data-testid^="peritem-"]')).toHaveCount(0);
});

// #270 차단3 — 시작 지연 중 충돌 CTA 차단. 범위·이력·Enter·연속 클릭을 함께 검증한다.
Then('시작 지연 중 범위 선택과 학습 이력이 비활성이다', async ({ page }) => {
  const region = page.getByRole('region', { name: copy.study.startTitle });
  await expect(region.getByRole('button', { name: copy.study.historyLink })).toBeDisabled();
  await expect(region.getByRole('button', { name: copy.study.historyLink })).toHaveAttribute('aria-busy', 'true');
  for (const radio of await region.getByRole('radio').all()) {
    await expect(radio).toBeDisabled();
  }
});

// #270 B1 — Tab 순회가 영역을 실제로 지나갔음을 증명한다.
//  (1) 매 Tab/Shift+Tab 뒤 activeElement 를 식별자(마커·tag·role·접근이름·id·텍스트)로 기록한다.
//  (2) region 내부 focusable 이 0개(전부 disabled)임을 확인하고, DOM 순서상 region 직후 focusable
//      (없으면 문서 처음으로 순환)을 계산해 Tab 이 그 요소에 도달했음을 확인한다(안전 상한 30회).
//  (3) 기록된 어떤 activeElement 도 비활성 조작(시작·이력·범위 라디오·이어풀기)이 아님을 확인한다.
// disabled 요소는 Tab 순서에서 제외되므로 "비활성 조작에 포커스가 가지 않음"만으로는 영역 도달을
// 증명할 수 없다. (2) 의 순서 기록(region 직전 요소 → region 직후 요소)이 영역 통과를 대신 증명한다.
// 이 스텝이 검증하는 범위: (a) 대기 중 region 조작이 전부 disabled 이고 focusable 이 0개,
// (b) Tab/Shift+Tab 순회가 region 내부로 들어가지 않고 region 직후 요소까지 도달한다,
// (c) 순회 중 기록된 어떤 요소도 비활성 조작이 아니다. (b) 는 순회 중 focus 대상 식별자
// (마커·tag·role·접근이름·id·텍스트) 배열로 남기고 실패 시 그 배열을 메시지에 포함한다.
When('대기 중 Tab 순회에서는 비활성 조작에 포커스가 가지 않는다', async ({ page }) => {
  const region = page.getByRole('region', { name: copy.study.startTitle });
  const startBtn = region.locator('button').first();
  const historyBtn = region.getByRole('button', { name: copy.study.historyLink });
  const radios = region.getByRole('radio');

  await expect(startBtn).toBeDisabled();
  await expect(historyBtn).toBeDisabled();
  for (const radio of await radios.all()) {
    await expect(radio).toBeDisabled();
  }

  // 안전 상한 — 이 값을 넘기면 영역을 통과하지 못한 것으로 실패한다.
  const MAX_TABS = 30;

  // DOM 조사 + 식별 마커 부여(테스트 런타임 한정). 제품 코드는 건드리지 않는다.
  const plan = await page.evaluate(
    (labels) => {
      const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
      const isVisible = (el: Element): boolean => {
        for (let p: Element | null = el; p; p = p.parentElement) {
          if (p.hasAttribute('hidden')) return false;
          if (p.getAttribute('aria-hidden') === 'true') return false;
          const style = getComputedStyle(p);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
      };
      const isTabbable = (el: Element): boolean => {
        const html = el as HTMLElement;
        if (html.matches(':disabled')) return false;
        const tabindex = html.getAttribute('tabindex');
        if (tabindex !== null && Number(tabindex) < 0) return false;
        return isVisible(html);
      };
      const describe = (el: Element | null) => {
        if (!el) return null;
        const html = el as HTMLElement;
        return {
          marker: html.getAttribute('data-b1-focus'),
          tag: html.tagName.toLowerCase(),
          role: html.getAttribute('role'),
          ariaLabel: html.getAttribute('aria-label'),
          id: html.id || null,
          text: (html.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
        };
      };

      document.querySelectorAll('[data-b1-focus]').forEach((n) => n.removeAttribute('data-b1-focus'));
      document.querySelectorAll('[data-b1-inactive]').forEach((n) => n.removeAttribute('data-b1-inactive'));
      document.querySelectorAll('[data-b1-region]').forEach((n) => n.removeAttribute('data-b1-region'));

      const regionEl = document.querySelector(`section[aria-label="${labels.regionLabel}"]`);
      if (!regionEl) return null;
      regionEl.setAttribute('data-b1-region', '1');

      // region 내부 조작에 종류 표시 — 시작/이력/범위 라디오/이어풀기
      const regionButtons = Array.from(regionEl.querySelectorAll('button'));
      regionButtons.forEach((button, index) => {
        const text = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
        let kind = 'other';
        if (index === 0) kind = 'start';
        else if (text.includes(labels.history)) kind = 'history';
        else if (text.includes(labels.resume)) kind = 'resume';
        button.setAttribute('data-b1-inactive', kind);
      });
      regionEl.querySelectorAll('input[type="radio"]').forEach((radio) => {
        radio.setAttribute('data-b1-inactive', 'radio');
      });

      const focusables = Array.from(document.querySelectorAll(FOCUSABLE)).filter(isTabbable);
      focusables.forEach((el, index) => el.setAttribute('data-b1-focus', String(index)));

      const follows = (el: Element, ref: Element): boolean =>
        (ref.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const afterRegion = focusables.find((el) => follows(el, regionEl)) ?? null;
      const beforeRegion = focusables.filter((el) => follows(regionEl, el));
      const before = beforeRegion.length ? beforeRegion[beforeRegion.length - 1] : null;

      return {
        totalFocusable: focusables.length,
        regionFocusableCount: Array.from(regionEl.querySelectorAll(FOCUSABLE)).filter(isTabbable).length,
        first: describe(focusables[0] ?? null),
        before: describe(before),
        // region 직후 focusable — 없으면 문서 처음으로 순환한다.
        expected: describe(afterRegion ?? focusables[0] ?? null),
      };
    },
    {
      regionLabel: copy.study.startTitle,
      history: copy.study.historyLink,
      resume: copy.study.continueStudy,
    },
  );

  expect(plan, '학습 범위 선택 영역(region)을 찾지 못했다').not.toBeNull();
  if (!plan) throw new Error('학습 범위 선택 영역(region)을 찾지 못했다');
  expect(plan.expected, 'focusable 요소가 하나도 없다').not.toBeNull();
  if (!plan.expected) throw new Error('focusable 요소가 하나도 없다');

  // (2-a) region 내부 focusable 은 0개 — 모든 조작이 disabled 라 Tab 순서에서 제외된다.
  expect(
    plan.regionFocusableCount,
    'region 내부에 focusable 조작이 있다(전부 disabled 여야 한다)',
  ).toBe(0);

  const readActive = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const html = el && el !== document.body ? el : null;
      return {
        marker: html ? html.getAttribute('data-b1-focus') : null,
        tag: html ? html.tagName.toLowerCase() : 'body',
        role: html ? html.getAttribute('role') : null,
        ariaLabel: html ? html.getAttribute('aria-label') : null,
        id: html && html.id ? html.id : null,
        text: html ? (html.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) : '',
        disabled: html ? html.matches(':disabled') : false,
        inactive: html ? html.getAttribute('data-b1-inactive') : null,
        inRegion: html ? !!html.closest('[data-b1-region]') : false,
      };
    });

  // (1) 식별자 기록 — 어느 요소가 포커스를 받았는지 남긴다.
  const visited: Awaited<ReturnType<typeof readActive>>[] = [];
  const trace = (v: Awaited<ReturnType<typeof readActive>>): string =>
    `#${v.marker ?? '-'} ${v.tag}${v.ariaLabel ? `[aria-label=${v.ariaLabel}]` : ''}` +
    `${v.id ? `#${v.id}` : ''} "${v.text}"${v.inactive ? ` inactive=${v.inactive}` : ''}`;

  // 순회는 문서 첫 focusable 에서 시작한다(결정적 시작점).
  await page.evaluate(() => {
    const first = document.querySelector<HTMLElement>('[data-b1-focus="0"]');
    (first ?? document.body).focus();
  });
  visited.push(await readActive());

  const firstIndexOf = (marker: string | null | undefined): number =>
    visited.findIndex((v) => v.marker === marker);
  const lastIndexOf = (marker: string | null | undefined): number => {
    for (let i = visited.length - 1; i >= 0; i--) {
      if (visited[i].marker === marker) return i;
    }
    return -1;
  };

  // 정방향 통과: region 직전 요소에 도달한 뒤 region 직후 요소에 도달하면 영역을 통과한 것이다.
  // region 뒤에 focusable 이 없으면 문서 처음으로 순환한다. 이때 브라우저가 문서를 벗어났다가
  // 다시 들어오면서 body 를 거칠 수 있으므로 "연속"이 아니라 "순서"로 판정한다.
  const crossedForward = (): boolean => {
    if (!plan.before) return visited[0]?.marker === plan.expected?.marker;
    const beforeIndex = firstIndexOf(plan.before.marker);
    if (beforeIndex < 0) return false;
    return visited.some((v, index) => index > beforeIndex && v.marker === plan.expected?.marker);
  };

  for (let i = 0; i < MAX_TABS && !crossedForward(); i++) {
    await page.keyboard.press('Tab');
    visited.push(await readActive());
  }
  expect(
    crossedForward(),
    `Tab 이 region 직후 focusable(${plan.expected.tag} "${plan.expected.text}")에 도달하지 못했다. 기록: ${visited.map(trace).join(' → ')}`,
  ).toBe(true);

  // 역방향 통과: region 직후 요소 다음에 region 직전 요소가 오면 역방향도 영역을 건너뛴 것이다.
  if (plan.before) {
    const crossedBackward = (): boolean => {
      const expectedIndex = lastIndexOf(plan.expected?.marker);
      if (expectedIndex < 0) return false;
      return visited.some((v, index) => index > expectedIndex && v.marker === plan.before?.marker);
    };
    for (let i = 0; i < MAX_TABS && !crossedBackward(); i++) {
      await page.keyboard.press('Shift+Tab');
      visited.push(await readActive());
    }
    expect(
      crossedBackward(),
      `Shift+Tab 이 region 직전 focusable("${plan.before.text}")에 도달하지 못했다. 기록: ${visited.map(trace).join(' → ')}`,
    ).toBe(true);
  }

  // (3) 기록된 어떤 요소도 비활성 조작(시작·이력·범위 라디오·이어풀기)이 아니다.
  const inactiveHits = visited.filter((v) => v.inactive !== null || v.inRegion);
  expect(
    inactiveHits.map((v) => trace(v)),
    '비활성 조작에 포커스가 갔다',
  ).toEqual([]);
  const disabledHits = visited.filter((v) => v.disabled);
  expect(
    disabledHits.map((v) => trace(v)),
    '비활성 요소에 포커스가 갔다',
  ).toEqual([]);

  // 이어풀기 버튼은 충돌(conflict)일 때만 렌더된다. 이 시나리오는 충돌이 없어 미렌더다.
  await expect(page.getByRole('button', { name: copy.study.continueStudy })).toHaveCount(0);

  // 순회 뒤에도 시작 버튼은 여전히 대기 상태여야 한다(지연 창 안에서 실행).
  await expect(startBtn).toBeDisabled();
});

// #270-r2 완료 뒤 조작 복구 — 시작 성공 후 문제 화면에서 답안 조작이 가능해야 한다.
Then('문제 화면에서 첫 보기가 조작 가능하다', async ({ page }) => {
  const first = page.getByLabel(/보기 1/).first();
  await expect(first).toBeEnabled();
  await first.focus();
  await expect(first).toBeFocused();
});

When('시작 버튼을 연속 클릭하면', async ({ page }) => {
  const btn = page.getByRole('region', { name: copy.study.startTitle }).locator('button').first();
  await btn.dispatchEvent('click');
  await btn.dispatchEvent('click');
  await btn.dispatchEvent('click');
});

// #270 차단3 — 제출 지연 중 답안·포기·취소 차단. 확정 후 취소는 실제 요청 취소가 아니다.
Then('제출 지연 중 답안 입력과 포기하기와 취소가 비활성이다', async ({ page }) => {
  await expect(page.getByLabel(/보기 1/).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: copy.study.pass })).toBeDisabled();
  await expect(page.getByRole('button', { name: copy.study.abandon })).toBeDisabled();
  await expect(page.getByRole('button', { name: copy.study.cancel })).toBeDisabled();
});

When('제출 확인 버튼을 연속 클릭하면', async ({ page }) => {
  const btn = page.getByRole('button', { name: copy.study.confirmSubmit });
  await btn.dispatchEvent('click');
  await btn.dispatchEvent('click');
  await btn.dispatchEvent('click');
});

// #270 차단3 — 응답 유실→409→이어풀기. fetch 실패를 timeout이라 부르지 않는다.
Then('이미 진행 중인 세트 안내가 보인다', async ({ page }) => {
  await expect(page.getByText(/이미 진행 중인 세트/)).toBeVisible();
});

When('이어풀기를 누르면', async ({ page }) => {
  await page.getByRole('button', { name: copy.study.continueStudy }).click();
});
