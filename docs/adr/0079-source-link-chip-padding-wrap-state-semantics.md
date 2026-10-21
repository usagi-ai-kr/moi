---
id: ADR-0079
title: 근거 링크 칩 padding·wrap·상태·외부링크 semantics
status: Accepted
date: 2026-10-21
related: ["#272", "#268", "#274", "#270"]
---

# ADR-0079: 근거 링크 칩 padding·wrap·상태·외부링크 semantics

## 배경
- 근거(SourceLinks) 칩의 hover 배경이 텍스트에 바짝 붙어 시각적 여유가 부족했다.
- 긴 문서명 줄바꿈 시 hover 배경이 쪼개지거나 우측이 잘릴 수 있었다.
- `/review` 320px 가로 overflow가 보고되었으나, 근거 링크 칩 자체는 오버플로 목록에 없고 툴바 영역 기존 결함과 구분된다.

## 결정
- `.moi-source-links` 행 간격을 `gap: var(--moi-space-1)`로 둔다.
- 칩 `a`에 `padding-inline: var(--moi-space-2)`, `padding-block: var(--moi-space-1)`, `margin-inline: calc(-1 * var(--moi-space-2))`를 두어 hover 배경 여유를 주면서 텍스트 정렬을 유지한다.
- `flex-wrap: wrap`, `min-width: 0`, `max-width: 100%`, `white-space: normal`, `box-decoration-break: clone`으로 wrap·clipping을 방지한다.
- `:visited` 색·밑줄 색을 정의하고 `:hover`/`:focus-visible`/`:visited:hover` 배경을 통일한다.
- `SourceLinks.tsx`는 변경하지 않아 외부 링크 semantics(`href`, `title`, `target="_blank"`, `rel="noreferrer"`)를 유지한다.

## 결과
- 긍정: hover 박스 여유와 텍스트 정렬이 개선되고, 긴 문서명 줄바꿈이 안정적으로 동작한다. 터치 타깃 44px 이상 유지.
- 부정/제약: hover 박스가 열 기준 좌측으로 8px 돌출하는 비차단 결함은 #268 후속으로 남는다. `/review` 툴바 320px overflow는 별도 기존 결함(#274/#270 후보)이며 이 결정 범위가 아니다.

## 대안과 금지 사항
- 근거 링크 칩 CSS 외의 컴포넌트/레이아웃 수정은 이번 결정에서 금지한다.
- `/review` 툴바 overflow 원인 확정 및 수정은 #274/#270 후속에서 처리한다.

## 참고
- #272, 교차 리뷰 `tmp/review-272-source-chip.md`, `tmp/review-272-measure.out`.
