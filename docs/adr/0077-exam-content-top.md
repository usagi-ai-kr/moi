---
id: ADR-0077
title: 시험 선택을 콘텐츠 최상단으로 이동
status: Accepted
date: 2026-10-21
related: ["#273", "#259", "#239", "ADR-0068"]
---

# ADR-0077: 시험 선택을 콘텐츠 최상단으로 이동

## 배경
- #273 — desktop nav 오른쪽의 시험 selector가 전역 메뉴와 섞이고, 각 화면의 시험 기준 표시 위치·표현이 다르다. 사용자는 선택된 시험이 각 페이지 맨 위에 일관되게 보이길 원한다.
- #259에서 페이지별 `ExamScope` 배지 중복을 제거해 상단 selector 1곳으로 단일화했으나, selector 자체가 nav/Drawer에 있어 메뉴와 섞이는 문제가 남았다.
- #269의 copy/StartView/study.css는 별도 단위 소유이므로 이 단위에서 건드리지 않고 셸에서 해결해야 한다.

## 결정
- desktop nav·모바일 Drawer에서 `ExamSelector`를 제거한다. 헤더 nav는 이동(학습 시작/현황·이력/복습/계정)·로그아웃만 담당한다.
- 공통 콘텐츠 최상단(페이지 제목 위, `AppShell` main-inner 첫 자식)에 실제 `<select>` 1개를 배치한다. 학습 시작·풀이·결과·이력/현황·복습 모두 같은 위치·간격·접근 이름(`시험`)을 공유한다.
- URL `?exam=` 단일 진실 원천·현재 선택 상태·허용목록(`EXAM_CATALOG`)·지원하지 않는 시험 옵션 추가 금지는 ADR-0068 그대로 유지한다.
- select는 라벨·셀렉트 간격 `space-2`, 오른쪽 padding `space-5`로 chevron 여유를 확보하고 44px 터치·키보드·스크린리더를 유지한다. 320/375/768/1024/1280·200%에서 overflow 0이다.

## 결과
- 긍정: 메뉴와 시험 선택의 역할 분리, 전 화면 일관된 최상단 위치, nav/Drawer 중복 0·단일 select 1개.
- 부정/제약: 홈·계정에도 같은 공통 선택이 보인다(일관성 우선). Phase 2(다중 시험 데이터 분리)는 범위 밖이다.

## 대안과 금지 사항
- 페이지별로 selector를 따로 두는 방식 금지(위치·간격 불일치 재발).
- nav/Drawer에 selector를 남기는 방식 금지. 지원하지 않는 시험 옵션 추가 금지.
- #269 소유 파일(copy/StartView/study.css) 변경 금지 — 셸에서만 해결한다.

## 참고
- `src/ui/AppShell.tsx`·`src/ui/shell.css`·`src/ui/drawer.css`·`src/ui/exam/*`, 이슈 #273·#259·#239, DESIGN.md §1·§2·§5.
