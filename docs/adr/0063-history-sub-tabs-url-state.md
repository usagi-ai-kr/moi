---
id: ADR-0063
title: 학습 현황 하위 탭의 URL 상태·패널 분할·Tabs 구현 결정
status: Accepted
date: 2026-10-21
related: ["#224", "ADR-0036", "ADR-0057"]
---

# ADR-0063: 학습 현황 하위 탭의 URL 상태·패널 분할·Tabs 구현 결정

## 배경
- #224 — `/history`에 요약·영역 카드·취약·완료 목록이 세로로 펼쳐져 정보 과다.
- `?page=`(ADR-0036)와 공존해야 하며, shadcn `Tabs` 정본의 `@radix-ui/react-tabs`는 미설치다.

## 결정
- **탭 계약**: `?tab=summary|domains|completed`, 불량값은 `summary`로 replace. 우선순위 ① 유효 `tab` ② `tab` 없이 `page`만 있으면 `completed`(첫 렌더에 replace 명시) ③ 그 외 `summary`. 식별자 URL 노출 금지.
- **상태**: URL이 단일 진실 원천. 사용자 이동=push, 자동 보정=replace, `page` 보존.
- **마운트**: 활성 패널만 마운트. TanStack Query(`staleTime 30s`) 공유로 신선 구간 전환 시 재요청·스켈레톤 0회(만료 후 재검증 허용).
- **게이트**: 통계는 요약·분석에서만, 이력은 완료에서만 조회. out-of-range 보정 effect는 `completed`에서만 실행(숨은 탭 URL 변경 금지).
- **Tabs**: 의존성 0 로컬 primitive(`tabs.tsx`, roving tabindex·방향키·Home/End). ADR-0057 방침은 Drawer 한정이며 본 단위 판단으로 기록. Radix 도입은 별도 ADR.
- **영역 카드**: `STUDY_DOMAINS` 4고정 표시 모델. 없는 영역은 `데이터 부족`·`학습 이력 없음`·`—`(0%·0문제 발명 금지). 집계·API·D1 무변경.
- **반응형**: 탭 `flex-wrap`+44px, 영역 ≤767px 1열·≥768px 2열.

## 결과
- 긍정: 탭 분리·딥링크·뒤로가기 일관, 숨은 DOM·불필요 호출 제거, 신규 의존성 0.
- 부정/제약: 수동 ARIA 검증 부담(RTL·키보드·200% 필수), 구 `?page` 링크 초기 화면 변경(호환 해석 유지).

## 대안과 금지 사항
- 경로 탭(`/history/summary`) — 레거시 `/:setId`와 충돌해 금지. 로컬 state 전용·`hidden` 전체 렌더·말줄임 은폐 금지. 없는 영역 수치 발명 금지.

## 참고
- #224, DESIGN.md 2·3·5·9절, ADR-0035·0036·0057·0012, 준비 보고서 `tmp/report-224-history-tabs-prep.md`.
