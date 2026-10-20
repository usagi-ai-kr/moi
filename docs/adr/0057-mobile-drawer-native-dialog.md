---
id: ADR-0057
title: 모바일 햄버거·우측 Drawer 구현과 반응형 breakpoint 정책
status: Accepted
date: 2026-10-20
related: ["#215", "#148", "#212", "#132"]
---

# ADR-0057: 모바일 햄버거·우측 Drawer 구현과 반응형 breakpoint 정책

## 배경
- 사전 감사(#215): 320px에서 가로 nav 여유는 1.5px, 361px 부근 패딩 복귀 절벽이 있어 문구·폰트 변경 한 번으로 nav가 2행으로 무너진다. nav 라벨 150% 확대 시 헤더가 61px→157px로 팽창한다(화면 높이의 29%).
- 가로 nav는 DOM에 상주해 모바일에서 키보드·AT에 8개 메뉴가 중복 노출될 수 있고, 320px 페이지네이션은 라벨이 단어 중간 줄바꿈된다.
- z-index는 헤더 10·fixed 10 두 곳뿐이라 `body`에 포털한 일반 div Drawer는 헤더에 덮인다(A-7). 헤더 실측 61px과 토큰 56px도 불일치한다(A-10).

## 결정
- (a) Drawer는 **native `<dialog>` + `showModal()`** 로 구현한다. top layer·포커스 트랩·Escape·`::backdrop`·닫힘 시 트리거로 포커스 복귀를 브라우저가 제공하고 **새 런타임 의존성이 0**이다. `showModal` 미지원 환경은 `open` 속성 폴백으로 처리한다. dialog 엘로먼트는 항상 마운트한다(언마운트 시 포커스 복귀가 깨진다).
- (b) breakpoint는 **≤767px Drawer / ≥768px 가로 nav**다. 768px은 물리적 한계가 아니라 정책이다 — 767px에서도 가로 nav는 여유 371px로 가능하지만, 320px 임계(1.5px)·361px 절벽·150% 확대 붕괴를 모두 제거하려면 nav를 모바일에서 빼야 한다. 문구가 길어지면 nav 폭이 다시 768px 미만 구간 위험을 만들므로 문구 변경 시 5폭 스윕을 재실행한다.
- (c) 모바일 구간의 가로 nav는 `hidden` 속성 + `.moi-nav[hidden]{display:none}`으로 **화면·키보드·AT에서 제거**한다(CSS 시각 숨김만으로는 중복 노출을 막지 못한다).
- (d) Drawer 지오메트리: 폭 `min(320px, 100vw - 48px)`(320px 뷰포트에서 272px — 백드롭 클릭 영역 확보), 높이 `100dvh`(100vh 폴백), `env(safe-area-inset-*)`, 내부 스크롤 `overflow-y:auto`+`overscroll-behavior:contain`, 우측 고정 `z-index:40`(헤더 10 위). 전환은 `prefers-reduced-motion: no-preference`에서만 실행한다.
- (e) 배경 스크롤 잠금은 `documentElement.style.overflow=hidden` + iOS용 `body{position:fixed;top:-scrollY}` 스냅샷 복원으로 하고, 잠금 해제 시 `scrollY`를 되돌린다.
- (f) `100vh`는 `100dvh`로 대체한다(fallback 유지). 셸 헤더 높이는 토큰 `--moi-shell-header-h: 61px`로 실측과 일치시킨다(브랜드 44 + 패딩 16 + 테두리 1).
- (g) 페이지네이션은 `flex-wrap` + `whitespace-nowrap`로 320px 단어 중간 줄바꿈을 없앤다. `overflow-x:hidden`으로 결함을 은폐하지 않는다.

## 결과
- 긍정: 모바일 nav 붕괴·중복 노출·가림 회귀 0건, Drawer 접근성(aria-expanded/controls·레이블·포커스 복귀·스크롤 잠금) 브라우저 지원, 새 의존성 0.
- 부정/제약: `showModal` 미지원 브라우저는 폴백 경로(포커스 트랩 미제공)에 머문다. 실기기(iOS Safari 주소창·회전) 검증은 아직 없다.

## 대안과 금지 사항
- `@radix-ui/react-dialog` + shadcn Sheet 포팅 — 미설치 패키지를 전제하므로 금지(배포 스택 변경 = 별도 ADR).
- 일반 `div` + `body` 포털 Drawer — 헤더 z-index 10에 가려질 수 있어 금지(일반 div 구현 시 z-index 40+ 명시).
- 가로 nav를 시각적으로만 숨기고 DOM에 남기는 것 — 키보드·AT 중복 노출로 금지.
- `overflow-x:hidden`으로 오버플로를 감추는 것 — 금지.

## 참고
- 이슈 #215, `tmp/audit-215-mobile.md`(사전 감사 A-1~A-13), `src/ui/components/ui/drawer.tsx`, `src/ui/drawer.css`, `src/ui/responsive.ts`, `tests/ui/drawer.test.tsx`, `e2e/features/mobile-nav.feature`.
