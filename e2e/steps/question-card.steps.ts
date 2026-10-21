import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Then } = createBdd();

// #274 — 일반 학습이 복습 카드형 질문·선택지 디자인을 공유한다.
// 기존 학습/복습 동작(제출 시 채점 등)은 그대로 두고 시각적 공통화만 본다.
Then('풀이 질문 카드와 선택지 행이 보인다', async ({ page }) => {
  const section = page.locator('section.moi-study');
  await expect(section).toBeVisible();
  const card = section.locator('[data-slot="card"]').first();
  await expect(card).toBeVisible();
  await expect(section.locator('[data-slot="card-title"]').first()).toBeVisible();
  await expect(section.getByText('문제 0 본문: VPC와 서브넷 구성은?')).toBeVisible();

  const first = section.getByLabel(/보기 1/).first();
  await expect(first).toBeVisible();
  const box = await first.boundingBox();
  expect(box).not.toBeNull();
  // 라벨 행 전체가 44px 터치 타깃을 제공한다(input 자체가 아니라 label 행 기준).
  const rowInfo = await first.evaluate((el) => {
    const label = el.closest('label');
    if (!label) return null;
    const b = label.getBoundingClientRect();
    const cs = getComputedStyle(label);
    return { h: b.height, borderWidth: cs.borderWidth, radius: cs.borderRadius };
  });
  expect(rowInfo).not.toBeNull();
  expect(rowInfo!.h).toBeGreaterThanOrEqual(44 - 1);
  expect(parseFloat(rowInfo!.borderWidth)).toBeGreaterThan(0);
  expect(parseFloat(rowInfo!.radius)).toBeGreaterThan(0);
});
