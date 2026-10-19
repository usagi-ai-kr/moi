---
id: ADR-0035
title: 학습 UI shadcn/ui·Tailwind 전환과 디자인 계약
status: Accepted
date: 2026-10-19
related: ["#148", "#132", "#50", "#52", "#65", "ADR-0012", "ADR-0014", "ADR-0018"]
---

# ADR-0035: 학습 UI shadcn/ui·Tailwind 전환과 디자인 계약

## 배경
- 실제 로그인·문항 풀이·결과 화면이 중첩되고, 내부 UUID 표시·작은 글자·버튼 불일치·원시 비동기 노출·끝없이 이어진 결과 목록 등 사용성이 크게 떨어진다.
- 기존 Ant Design 6 사용 및 Lighthouse 점수는 이 결함을 해결하지 못했다. 사용자 요청에 따라 화면 구조와 UI 기술을 신속히 재설계한다.

## 제안 결정
- 화면의 규범 문서는 루트 `DESIGN.md`로 두고, #148의 페이지 분리·상단 nav·UUID 비노출·페이지네이션·상태 UX·아이콘 기준을 수용 조건으로 삼는다.
- 신설/교체 UI 컴포넌트는 **shadcn/ui + Tailwind CSS**로 전환. React SPA/Vite/Router/Hono/D1/Cloudflare 및 기존 세션·도메인 계약은 유지한다.
- 시각 조작 아이콘은 GitHub Primer처럼 크기·선 굵기·대비·의미를 일관되게 구성하되 GitHub 브랜드/로고를 복제하지 않는다. 브랜드 favicon과 시스템 아이콘은 분리.
- 기존 `tokens.ts` → CSS 변수 → Tailwind/shadcn 단일 매핑을 유지하고, 과도기 AntD 혼용은 임시로 한정한다.
- preflight는 단계적 도입(이번 단위 제외), AntD는 과도기로 한정하고 신규 화면은 shadcn 패턴을 사용한다.
- 이전 ADR-0012·0014·0018의 색·폰트·보안·성능 등 비충돌 규칙은 유지한다. AntD를 확정 라이브러리로 지정한 **해당 조항만** 구현 PR에서 supersede/조정한다. 병합 시 AGENTS·스킬 동기화.
- 디자인 완료는 실제 화면 before/after, 5 viewport, keyboard/a11y, spinner/empty/error, 사용자의 시각적 확인, CI로 판단한다. Lighthouse 단독 합격 불가.

## 결과/위험
- 공통 컴포넌트와 UI 상태를 빠르게 통일하지만 패키지·스타일·테스트 마이그레이션, shadcn 소스 보안 업데이트 유지 비용이 생긴다.
- 완전 대체가 끝날 때까지 기능 회귀·스타일 충돌·번들 증대에 주의한다. SSR 도입, 인증/채점 재작성, 기능 범위 무단 확장은 금지.

## 참고
- #148, #132, #65, 루트 `DESIGN.md`, `frontend-responsive-ui` 스킬.
