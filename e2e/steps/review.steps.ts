import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { copy } from '../../src/ui/copy';

const { Given, When, Then } = createBdd();

interface FakeStudyItem {
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

interface ReviewMockItem {
  questionId: string;
  validWrongCount?: number;
  stem: string;
  options: Array<{ optionId: string; text: string }>;
  answerCount: number;
  explanation: string;
  sourceUrls: string[];
  correctOptionIds: string[];
}

let activeStudySet: {
  id: string;
  status: string;
  items: FakeStudyItem[];
} | null = null;

let wrongItems: ReviewMockItem[] = [];
let bookmarkPool: ReviewMockItem[] = [];
let bookmarkedIds = new Set<string>();

let activeReviewSession: {
  examId: string;
  mode: 'wrong' | 'bookmark';
  status: 'active' | 'ended';
  cursor: number;
  total: number;
  items: ReviewMockItem[];
  graded: Array<{
    questionId: string;
    response: unknown;
    correct: boolean;
  }>;
} | null = null;

function resetReviewMock() {
  activeStudySet = null;
  bookmarkedIds = new Set<string>();
  activeReviewSession = null;

  wrongItems = [
    {
      questionId: 'q-w1',
      validWrongCount: 1,
      stem: '오답 복습 문항 1: VPC 피어링 제약 사항은?',
      options: [
        { optionId: 'opt-w1-a', text: 'CIDR 블록 중복 불가' },
        { optionId: 'opt-w1-b', text: '동일 리전 한정' },
      ],
      answerCount: 1,
      explanation: 'VPC 피어링은 CIDR 블록이 중복되면 연결할 수 없습니다.',
      sourceUrls: ['https://docs.aws.amazon.com/vpc/peering'],
      correctOptionIds: ['opt-w1-a'],
    },
    {
      questionId: 'q-w2',
      validWrongCount: 2,
      stem: '오답 복습 문항 2: S3 버킷 암호화 기본 설정은?',
      options: [
        { optionId: 'opt-w2-a', text: 'SSE-S3 기본 활성화' },
        { optionId: 'opt-w2-b', text: '암호화 미지원' },
      ],
      answerCount: 1,
      explanation: 'S3는 모든 새 버킷에 SSE-S3 기본 암호화를 적용합니다.',
      sourceUrls: ['https://docs.aws.amazon.com/s3/encryption'],
      correctOptionIds: ['opt-w2-a'],
    },
  ];

  bookmarkPool = [
    {
      questionId: 'q-bm1',
      validWrongCount: 0,
      stem: '북마크 복습 문항 1: DynamoDB 파티션 키 설계 원칙은?',
      options: [
        { optionId: 'opt-bm1-a', text: '균등한 I/O 분산 키 선정' },
        { optionId: 'opt-bm1-b', text: '단일 파티션 집중' },
      ],
      answerCount: 1,
      explanation: '파티션 키는 파티션 간 읽기/쓰기 요청을 균등하게 분산해야 합니다.',
      sourceUrls: ['https://docs.aws.amazon.com/dynamodb/partition-keys'],
      correctOptionIds: ['opt-bm1-a'],
    },
  ];
}

function submittedDto(s: NonNullable<typeof activeStudySet>) {
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
    // 서버 제출 계약 그대로 — answerOptionIds 있음·answerCount 없음(#176).
    items: s.items.map((it) => ({
      questionId: it.questionId,
      questionVersionId: it.questionVersionId,
      versionNo: it.versionNo,
      optionOrder: it.optionOrder,
      stem: it.stem,
      options: it.options,
      answerOptionIds: [`${it.questionId}-a`],
      explanation: it.explanation,
      sourceUrls: it.sourceUrls,
      response: it.response,
    })),
    result,
  };
}

Given('복습 API 모의가 준비되면', async ({ page }) => {
  resetReviewMock();

  await page.route('**/api/me', async (route) => {
    await route.fulfill({ status: 200, json: { user: { id: 'e2e-user-1' } } });
  });

  await page.route('**/api/study/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    if (method === 'POST' && path === '/api/study/sets') {
      const items: FakeStudyItem[] = Array.from({ length: 10 }, (_, i) => ({
        questionId: `q-${i}`,
        questionVersionId: `qv-${i}`,
        versionNo: 1,
        optionOrder: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`],
        stem: `학습 문제 ${i} 본문: VPC와 서브넷 구성은?`,
        options: [`q-${i}-a`, `q-${i}-b`, `q-${i}-c`, `q-${i}-d`].map((id) => ({
          optionId: id,
          text: `보기 ${id} 내용`,
        })),
        answerCount: 1,
        explanation: `문제 ${i} 해설`,
        sourceUrls: [`https://docs.aws.amazon.com/q-${i}`],
        response: { kind: 'unanswered' },
      }));
      activeStudySet = { id: 'set-review-e2e', status: 'active', items };
      await route.fulfill({
        status: 201,
        json: {
          id: activeStudySet.id,
          userId: 'e2e-user-1',
          examId: 'saa-c03',
          mode: 'all',
          status: 'active',
          createdAt: 1700000000000,
          items: items.map((it) => ({
            questionId: it.questionId,
            questionVersionId: it.questionVersionId,
            versionNo: it.versionNo,
            optionOrder: it.optionOrder,
            stem: it.stem,
            options: it.options,
            answerCount: it.answerCount,
            response: it.response,
          })),
        },
      });
      return;
    }

    const m = path.match(/^\/api\/study\/sets\/([^/]+)(\/(answers|submit|abandon))?$/);
    if (m && activeStudySet) {
      const sub = m[3];
      if (method === 'GET' && !sub) {
        if (activeStudySet.status === 'submitted') {
          await route.fulfill({
            status: 200,
            json: submittedDto(activeStudySet),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          json: {
            id: activeStudySet.id,
            userId: 'e2e-user-1',
            examId: 'saa-c03',
            mode: 'all',
            status: activeStudySet.status,
            createdAt: 1700000000000,
            items: activeStudySet.items,
          },
        });
        return;
      }
      if (method === 'PATCH' && sub === 'answers') {
        const body = req.postDataJSON() as { questionId?: string; response?: FakeStudyItem['response'] };
        const it = activeStudySet.items.find((i) => i.questionId === body?.questionId);
        if (it && body.response) it.response = body.response;
        await route.fulfill({ status: 200, json: { outcome: body?.response?.kind ?? 'answered' } });
        return;
      }
      if (method === 'POST' && sub === 'submit') {
        let body: { confirmUnanswered?: boolean } | null = null;
        try {
          body = req.postDataJSON() as { confirmUnanswered?: boolean };
        } catch {
          body = null;
        }
        const hasUnanswered = activeStudySet.items.some((i) => i.response.kind === 'unanswered');
        if (hasUnanswered && body?.confirmUnanswered !== true) {
          await route.fulfill({ status: 422, json: { error: 'unanswered_not_confirmed' } });
          return;
        }
        activeStudySet.status = 'submitted';
        await route.fulfill({ status: 200, json: submittedDto(activeStudySet) });
        return;
      }
    }

    await route.fulfill({ status: 404, json: { error: 'not_found' } });
  });

  await page.route('**/api/review/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    // 1. GET /api/review/candidates?examId=...&mode=...
    if (method === 'GET' && path === '/api/review/candidates') {
      const examId = url.searchParams.get('examId') || 'saa-c03';
      const mode = (url.searchParams.get('mode') as 'wrong' | 'bookmark') || 'wrong';
      if (mode === 'wrong') {
        await route.fulfill({
          status: 200,
          json: {
            examId,
            mode: 'wrong',
            total: wrongItems.length,
            items: wrongItems.map((it) => ({
              questionId: it.questionId,
              validWrongCount: it.validWrongCount ?? 1,
              stem: it.stem,
              options: it.options,
            })),
          },
        });
        return;
      }
      // mode === 'bookmark'
      const items: Array<{
        questionId: string;
        validWrongCount: number;
        stem: string;
        options: Array<{ optionId: string; text: string }>;
      }> = [];
      for (const id of bookmarkedIds) {
        const poolItem = bookmarkPool.find((b) => b.questionId === id);
        if (poolItem) {
          items.push({
            questionId: poolItem.questionId,
            validWrongCount: 0,
            stem: poolItem.stem,
            options: poolItem.options,
          });
        } else {
          items.push({
            questionId: id,
            validWrongCount: 0,
            stem: `북마크된 학습 문항 (${id}) 본문`,
            options: [
              { optionId: `${id}-opt-1`, text: '보기 1' },
              { optionId: `${id}-opt-2`, text: '보기 2' },
            ],
          });
        }
      }
      await route.fulfill({
        status: 200,
        json: {
          examId,
          mode: 'bookmark',
          total: items.length,
          items,
        },
      });
      return;
    }

    // 2. POST /api/review/sessions
    if (method === 'POST' && path === '/api/review/sessions') {
      const body = req.postDataJSON() as { examId: string; mode: 'wrong' | 'bookmark' };
      const mode = body.mode;
      const itemsToReview: ReviewMockItem[] =
        mode === 'wrong'
          ? [...wrongItems]
          : Array.from(bookmarkedIds).map((id) => {
              const poolItem = bookmarkPool.find((b) => b.questionId === id);
              if (poolItem) return poolItem;
              return {
                questionId: id,
                validWrongCount: 0,
                stem: `북마크된 학습 문항 (${id}) 본문`,
                options: [
                  { optionId: `${id}-opt-1`, text: '보기 1' },
                  { optionId: `${id}-opt-2`, text: '보기 2' },
                ],
                answerCount: 1,
                explanation: '북마크 문항 해설입니다.',
                sourceUrls: ['https://docs.aws.amazon.com'],
                correctOptionIds: [`${id}-opt-1`],
              };
            });

      activeReviewSession = {
        examId: body.examId,
        mode,
        status: 'active',
        cursor: 0,
        total: itemsToReview.length,
        items: itemsToReview,
        graded: [],
      };

      const current = itemsToReview[0]
        ? {
            questionId: itemsToReview[0].questionId,
            stem: itemsToReview[0].stem,
            options: itemsToReview[0].options,
            answerCount: itemsToReview[0].answerCount,
            response: null,
          }
        : null;

      await route.fulfill({
        status: 201,
        json: {
          examId: body.examId,
          mode,
          status: 'active',
          cursor: 0,
          total: itemsToReview.length,
          current,
          items: itemsToReview.map((it) => ({ questionId: it.questionId, response: null })),
        },
      });
      return;
    }

    // 3. GET /api/review/sessions/current
    if (method === 'GET' && path === '/api/review/sessions/current') {
      const mode = (url.searchParams.get('mode') as 'wrong' | 'bookmark') || 'wrong';
      if (!activeReviewSession || activeReviewSession.mode !== mode || activeReviewSession.status === 'ended') {
        await route.fulfill({ status: 404, json: { error: 'not_found' } });
        return;
      }
      const curItem =
        activeReviewSession.cursor < activeReviewSession.items.length
          ? activeReviewSession.items[activeReviewSession.cursor]
          : null;
      const current = curItem
        ? {
            questionId: curItem.questionId,
            stem: curItem.stem,
            options: curItem.options,
            answerCount: curItem.answerCount,
            response: null,
          }
        : null;
      await route.fulfill({
        status: 200,
        json: {
          examId: activeReviewSession.examId,
          mode: activeReviewSession.mode,
          status: activeReviewSession.status,
          cursor: activeReviewSession.cursor,
          total: activeReviewSession.total,
          current,
          exhausted: current === null,
          items: activeReviewSession.items.map((it) => {
            const g = activeReviewSession!.graded.find((gr) => gr.questionId === it.questionId);
            return g
              ? { questionId: it.questionId, response: g.response, correct: g.correct }
              : { questionId: it.questionId, response: null };
          }),
        },
      });
      return;
    }

    // 4. POST /api/review/sessions/current/answers
    if (method === 'POST' && path === '/api/review/sessions/current/answers') {
      const body = req.postDataJSON() as {
        examId: string;
        mode: 'wrong' | 'bookmark';
        questionId: string;
        response: { kind: string; optionIds?: string[] };
      };
      if (!activeReviewSession) {
        await route.fulfill({ status: 404, json: { error: 'not_found' } });
        return;
      }
      const curItem = activeReviewSession.items[activeReviewSession.cursor];
      const isCorrect =
        body.response.kind === 'pass'
          ? false
          : (body.response.optionIds?.includes(curItem.correctOptionIds[0]) ?? false);

      activeReviewSession.graded.push({
        questionId: curItem.questionId,
        response: body.response,
        correct: isCorrect,
      });
      activeReviewSession.cursor += 1;
      const nextItem =
        activeReviewSession.cursor < activeReviewSession.items.length
          ? activeReviewSession.items[activeReviewSession.cursor]
          : null;

      await route.fulfill({
        status: 200,
        json: {
          correct: isCorrect,
          graded: {
            questionId: curItem.questionId,
            response: body.response,
            correct: isCorrect,
            explanation: curItem.explanation,
            sourceUrls: curItem.sourceUrls,
            correctOptionIds: curItem.correctOptionIds,
          },
          session: {
            examId: activeReviewSession.examId,
            mode: activeReviewSession.mode,
            status: 'active',
            cursor: activeReviewSession.cursor,
            total: activeReviewSession.total,
          },
          next: nextItem
            ? {
                questionId: nextItem.questionId,
                stem: nextItem.stem,
                options: nextItem.options,
                answerCount: nextItem.answerCount,
              }
            : null,
        },
      });
      return;
    }

    // 5. POST /api/review/sessions/current/end
    if (method === 'POST' && path === '/api/review/sessions/current/end') {
      if (!activeReviewSession) {
        await route.fulfill({ status: 404, json: { error: 'not_found' } });
        return;
      }
      activeReviewSession.status = 'ended';
      const total = activeReviewSession.total;
      const graded = activeReviewSession.graded.length;
      const correct = activeReviewSession.graded.filter((g) => g.correct).length;
      const pending = total - graded;
      await route.fulfill({
        status: 200,
        json: {
          examId: activeReviewSession.examId,
          mode: activeReviewSession.mode,
          status: 'ended',
          summary: {
            total,
            graded,
            pending,
            correct,
          },
        },
      });
      return;
    }

    // 6. GET /api/review/bookmarks and PATCH /api/review/bookmarks
    if (path === '/api/review/bookmarks') {
      if (method === 'GET') {
        const items = Array.from(bookmarkedIds).map((id) => {
          const found = bookmarkPool.find((b) => b.questionId === id);
          return {
            questionId: id,
            stem: found ? found.stem : `문항 ${id} 본문`,
            options: found ? found.options : [{ optionId: `${id}-a`, text: '보기 A' }],
          };
        });
        await route.fulfill({
          status: 200,
          json: {
            examId: 'saa-c03',
            total: items.length,
            items,
          },
        });
        return;
      }
      if (method === 'PATCH') {
        const body = req.postDataJSON() as { examId: string; questionId: string; bookmarked: boolean };
        if (body.bookmarked) {
          bookmarkedIds.add(body.questionId);
        } else {
          bookmarkedIds.delete(body.questionId);
        }
        await route.fulfill({
          status: 200,
          json: {
            questionId: body.questionId,
            bookmarked: body.bookmarked,
          },
        });
        return;
      }
    }

    await route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
});

Given('학습 결과에 오답이 발생하여 복습 대기 목록이 있으면', async () => {
  // 기본 상태(wrongItems 2개)를 유지한다
});

Given('진행 중인 복습 회차가 있으면', async () => {
  activeReviewSession = {
    examId: 'saa-c03',
    mode: 'wrong',
    status: 'active',
    cursor: 0,
    total: 2,
    items: [...wrongItems],
    graded: [],
  };
});

Given('복습 대기 문항이 없는 빈 상태이면', async () => {
  wrongItems = [];
  activeReviewSession = null;
});

Given('마지막 한 문제만 남은 복습 회차가 준비되면', async () => {
  const single = [wrongItems[0]];
  activeReviewSession = {
    examId: 'saa-c03',
    mode: 'wrong',
    status: 'active',
    cursor: 0,
    total: 1,
    items: single,
    graded: [],
  };
});

When('오답 복습 바로가기 버튼을 누르면', async ({ page }) => {
  await Promise.all([
    page.waitForURL(/\/review\?mode=wrong/),
    page.getByRole('link', { name: copy.review.goToWrongReview }).click(),
  ]);
});

When('복습 시작 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: copy.review.startAction }).click();
});

When('복습 첫 번째 보기를 선택하면', async ({ page }) => {
  await page.locator('fieldset input[type="checkbox"]').first().check();
});

When('복습 답안 제출 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: copy.review.submit }).click();
});

When('다음 복습 문제 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: copy.review.next }).click();
});

When('복습 종료 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: copy.review.endAction }).last().click();
});

When('북마크 버튼을 누르면', async ({ page }) => {
  await page.getByRole('button', { name: copy.review.bookmarkAdd }).click();
});

When('북마크 복습 페이지로 이동하면', async ({ page }) => {
  await page.goto('/review?mode=bookmark');
});

When('복습 페이지에 접속하면', async ({ page }) => {
  await page.goto('/review');
});

When('페이지를 새로고침하면', async ({ page }) => {
  await page.reload();
});

Then('복습 화면이 보인다', async ({ page }) => {
  await expect(page.getByRole('heading', { name: copy.review.title, level: 1 })).toBeVisible();
});

Then('복습 대기 목록이 보인다', async ({ page }) => {
  await expect(page.getByRole('heading', { name: new RegExp(copy.review.waitingPrefix) })).toBeVisible();
});

Then('복습 문제 화면이 보인다', async ({ page }) => {
  await expect(page.locator('text=/문제 \\d+\/\\d+/')).toBeVisible();
});

Then('즉시 채점 결과와 해설과 공식 근거가 보인다', async ({ page }) => {
  const feedback = page.getByRole('region', { name: '채점 피드백' });
  await expect(feedback).toBeVisible();
  // 상단 상태 배지와 정답 보기 표시가 같은 문구다 — 배지(첫 매칭)를 본다(#260).
  await expect(feedback.getByText(copy.review.correctBadge, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: copy.study.explanation })).toBeVisible();
  await expect(page.getByRole('heading', { name: copy.review.sources })).toBeVisible();
  const source = page.locator('.moi-source-links a').first();
  await expect(source).toBeVisible();
  expect(await source.innerText()).not.toMatch(/^https?:\/\//);
  await expect(source).toHaveAttribute('href', /^https:\/\/docs\.aws\.amazon\.com\//);
  await expect(source).toHaveAttribute('title', /^https:\/\/docs\.aws\.amazon\.com\//);
});

Then('북마크 상태가 해제로 바뀐다', async ({ page }) => {
  await expect(page.getByRole('button', { name: copy.review.bookmarkRemove })).toBeVisible();
});

Then('북마크 복습 대기 목록이 보인다', async ({ page }) => {
  await expect(page.getByRole('tab', { name: copy.review.tabBookmark, selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: new RegExp(copy.review.waitingPrefix) })).toBeVisible();
});

Then('오답 복습과 북마크 대상이 독립적이다', async ({ page }) => {
  // ADR-0059: 대기 목록은 개수만 표시하고 stem 목록은 노출하지 않는다. 독립성은 탭별 개수로 확인한다.
  await expect(page.getByRole('tab', { name: copy.review.tabBookmark, selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: new RegExp(copy.review.waitingPrefix) })).toBeVisible();
  await expect(page.getByText('VPC 피어링')).not.toBeVisible();
  await expect(page.getByText(/북마크된 학습 문항/)).not.toBeVisible();

  await page.getByRole('tab', { name: copy.review.tabWrong }).click();
  await expect(page.getByRole('tab', { name: copy.review.tabWrong, selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: new RegExp(copy.review.waitingPrefix) })).toBeVisible();
  await expect(page.getByText('VPC 피어링')).not.toBeVisible();

  await page.getByRole('tab', { name: copy.review.tabBookmark }).click();
  await expect(page.getByRole('tab', { name: copy.review.tabBookmark, selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: new RegExp(copy.review.waitingPrefix) })).toBeVisible();
});

Then('북마크 복습 문제가 보인다', async ({ page }) => {
  await expect(page.locator('text=/문제 \\d+\/\\d+/')).toBeVisible();
  await expect(page.getByText(/북마크된 학습 문항/)).toBeVisible();
});

Then('두 번째 복습 문제 위치로 재개된다', async ({ page }) => {
  await expect(page.getByText('문제 2/2')).toBeVisible();
});

Then('빈 복습 목록 안내가 보인다', async ({ page }) => {
  await expect(page.getByText(copy.review.emptyWrong)).toBeVisible();
});

Then('복습 시작 버튼이 없다', async ({ page }) => {
  await expect(page.getByRole('button', { name: copy.review.startAction })).not.toBeVisible();
});

Then('복습 종료 요약 화면이 보인다', async ({ page }) => {
  await expect(page.getByText(copy.review.endedTitle)).toBeVisible();
  await expect(page.getByRole('button', { name: '목록으로 돌아가기' })).toBeVisible();
});

Then('제출 전에는 정답과 해설과 공식 근거가 노출되지 않는다', async ({ page }) => {
  await expect(page.getByRole('heading', { name: copy.study.explanation })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: copy.review.sources })).not.toBeVisible();
  // 정답 보기 표시는 아이콘 + '정답' 텍스트다(#260 — '✓' 문자 제거).
  await expect(page.getByText(copy.review.correctBadge, { exact: true })).not.toBeVisible();
  await expect(page.getByText(copy.review.incorrectBadge, { exact: true })).not.toBeVisible();
});
