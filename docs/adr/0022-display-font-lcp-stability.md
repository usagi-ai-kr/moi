---
id: ADR-0022
title: 디스플레이 폰트 LCP 안정화 — optional·지연 주입
status: Accepted
date: 2026-10-18
related: ["#5", "0.1.4", "ADR-0012", "ADR-0014", "ADR-0018"]
---

# ADR-0022: 디스플레이 폰트 LCP 안정화 — optional·지연 주입

## 배경
- 배포 Lighthouse 모바일이 98 ↔ 71로 흔들렸다. 71 회차: FCP 1.8s·**LCP 10.4s**(TBT 0·CLS 0). 원인: `load`+1.2s 후 KoddiUD `@font-face`를 `swap`으로 주입하면 제목/브랜드가 늦게 바뀌며 LCP가 폰트 타이밍에 종속됐다.

## 결정
- 주입 `@font-face`를 `font-display:optional`로 바꾼다. 첫 로드는 Inter/시스템 폴백 유지, 캐시 후 로드에서 KoddiUD 적용(점진적 향상).
- 지연 주입 유지 + `requestIdleCallback`(미지원 시 `setTimeout`)으로 첫 페인트/LCP 이후로 미룬다.
- 공식 웹폰트 경로·라이선스(형태 그대로·재배포 금지) 유지, `preload`·임계 경로 편입 금지(ADR-0014 유지).

## 결과
- 긍정: LCP가 폰트 스왑에 무관해져 모바일 4개 카테고리 ≥90 재현. 폴백 스택은 기존 토큰 그대로라 CLS 영향 없음.
- 부정/제약: 첫 방문에서는 KoddiUD가 안 보일 수 있다(의도된 점진적 향상).

## 대안과 금지 사항
- `preload` — 대용량을 임계 경로에 넣어 기각. 폰트 제거 — 브랜드 의도 상실로 기각.

## 참고
- 이슈 #5·0.1.4 / `frontend-responsive-ui` 스킬 / 배포 URL 재측정은 병합 후 수행
