---
id: ADR-0086
title: 학습 범위·문항 수 선택 그룹 컨테이너와 옵션 간격 축소
status: Accepted
date: 2026-10-21
related: ["#303", "#269", "#275", "ADR-0076"]
---

# ADR-0086: 학습 범위·문항 수 선택 그룹 컨테이너와 옵션 간격 축소

## 배경
- 학습 시작 화면의 범위(전체/영역별/취약 영역)·문항 수(4/8) 선택지가 각각 떠 있는 목록처럼 보여 "하나의 선택 그룹"으로 읽히지 않았다 (#303).
- 옵션 행이 44px 터치 타깃이라 라디오 도트 사이 실제 간격이 32px였고 그룹 경계도 없었다.
- 복습 대기 목록의 가로형 4/8 그룹도 옵션 간 gap 8px로 흩어져 보였다.

## 결정
- 범위·문항 수 그룹의 옵션을 하나의 컨테이너(`.moi-study-options`)로 묶는다 — 테두리 1px + radius 8px + 패딩 8px.
- 그룹 안 옵션 간 gap을 space-2(8px) → space-1(4px)로 축소한다. 인접 옵션은 닿지 않는다(4px 유지).
- 범위 ↔ 문항 수 그룹 사이 간격(12px flex gap + 4px fieldset margin = 16px)은 그대로 둔다 — 섹션 위계 유지(#269).
- 세로 높이·글자 크기는 줄이지 않는다: 옵션 행 44px(min-height)·본문 18px 유지. 컨테이너 패딩이 시작 화면 높이를 24px 늘린다(460.6 → 484.6px).
- 복습 대기 목록의 가로형 4/8 그룹에도 같은 규칙(테두리·radius·패딩 8px·gap 4px)을 적용한다.
- 네이티브 radio name·checked·fieldset/legend은 그대로 둔다 — 키보드 radio semantics(그룹당 탭 정지 1개·화살표 이동) 유지.
- 선택 상태는 색상 외에 채워진 도트 + 라벨 600 굵기(기존 #269 규칙) + 네이티브 checked 상태로 구분한다.

## 결과
- 긍정: 두 그룹이 각각 하나의 선택 그룹으로 보인다. 옵션 간격 8px → 4px, 그룹 간격 16px 유지, 320~1280·200% 확대 무오버플로.
- 부정/제약: 시작 화면 높이가 24px 늘어난다(패딩 8px×2 + 테두리 2px, 간격 축소 -12px). 그룹 내부 최소 간격 4px는 DESIGN "요소 간 최소 8px"보다 좁지만 하나의 컨트롤 내부 간격이다.

## 대안과 금지 사항
- 가로 1줄(세그먼트) 배치 전환은 320px에서 3+2 옵션이 overflow·줄바꿈으로 깨진다 — 금지(세로 유지).
- 세로 높이·글자 크기 축소로 간격을 메우는 것은 금지(#303 AC).
- 범위 ↔ 문항 수 그룹 간격 변경은 금지.
- 범용 segmented control 컴포넌트 신설은 범위 밖 — 토큰 CSS 한 규칙 + Tailwind 유틸로 충분하다.

## 참고
- #303(본 이슈)·#269 범위 위계·#275 4/8 선택·ADR-0076.
- `src/ui/study/StartView.tsx`·`src/ui/study/study.css`·`src/ui/review/ReviewCandidates.tsx`·`tests/unit/ui/study-option-gap-303.test.ts`·`tests/ui/study-option-group-303.test.tsx`·`e2e/features/option-group.feature`.
