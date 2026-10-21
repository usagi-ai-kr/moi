---
id: ADR-0078
title: 문제 신고 액션 버튼 표면/상태/44px 계약
status: Accepted
date: 2026-10-21
related: [271]
---

# ADR-0078: 문제 신고 액션 버튼 표면/상태/44px 계약

## 배경
- `ReportButton`의 트리거는 이미 네이티브 `<button>`이지만 `.moi-report-open`이 `text-decoration: underline` + 무테두리라 링크처럼 보였다.
- 북마크 버튼(`BookmarkButton`, shadcn outline/secondary)과 같은 문항 액션 그룹에 놓여 시각 일관성이 깨졌다.
- 마크업 semantics(button/dialog/API)와 제출 데이터는 유지해야 한다.

## 결정
- `.moi-report-open`을 링크가 아닌 액션 버튼 표면으로 정리한다.
  - 1px border(`--moi-color-border`), 흰 배경, 잉크 텍스트
  - `padding-inline`/`padding-block`(`--moi-space-2`), radius(`--moi-radius-sm`)
  - `text-decoration: none`
  - hover: surface 배경 + 잉크 텍스트, active opacity 0.88, disabled cursor/opacity 0.5
  - focus-visible: 밑줄 none + 기존 outline 링
  - min-height/min-width `--moi-touch-min`(44px) 유지
- 아이콘+라벨 유지, 네이티브 button/dialog/API semantics 변경 금지.
- 학습·결과·복습 모든 `ReportButton` 위치에서 동일 CSS 계약을 공유한다(`study-feedback.css`).
- CSS 범위는 `.moi-report-open`과 기존 focus 규칙에 한정하며, 다른 컴포넌트 스타일은 변경하지 않는다.

## 결과
- 긍정: 신고 버튼이 북마크와 같은 액션 그룹에서 버튼으로 식별되고, 링크 인상이 사라진다. 44px 터치 타깃과 키보드 접근성을 유지한다.
- 부정/제약: 네이티브 CSS와 shadcn 버튼 표면의 완전한 1:1 일치는 보장하지 않으며, 시각 통일은 토큰 기반 CSS 계약으로 관리한다.

## 대안과 금지 사항
- shadcn `Button`으로 마크업 교체: semantics/테스트 계약 변경 위험이 있어 채택하지 않는다.
- `text-decoration: underline` 유지 또는 전역 `a { text-decoration: none }`: 금지(근거 링크 밑줄 유지).
- CSS 범위를 다른 버튼/컴포넌트로 확대: 금지.

## 참고
- 이슈 #271, #232, #233, #215, #148
- ADR-0012(디자인 토큰), ADR-0064(버튼 규칙)