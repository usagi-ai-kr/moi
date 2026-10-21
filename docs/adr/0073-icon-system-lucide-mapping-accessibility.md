---
id: ADR-0073
title: 아이콘 체계 — Lucide 단일 계열·액션 매핑·접근성 계약
status: Accepted
date: 2026-10-21
related: ["#233", "ADR-0012", "ADR-0014", "ADR-0035", "ADR-0064", "ADR-0050"]
---

# ADR-0073: 아이콘 체계 — Lucide 단일 계열·액션 매핑·접근성 계약

## 배경
- 아이콘 소스/크기/aria가 화면별로 혼재(텍스트 기호·CSS 아이콘·Lucide 혼용)하고 역할표가 없었다(ADR-0064).
- #233 Slice A는 화면 적용 없이 계약·매핑·기반 상수만 정한다.

## 결정
- 조작 아이콘은 Lucide 단일 계열만 사용한다. 신규 런타임 의존성·혼합 계열 금지. 카카오 공식 SVG·브랜드/favicon은 별도 자산으로 유지.
- 크기 토큰은 16/20/24px, stroke-width는 Lucide 기본(2) 통일, 광학 보정·임의 override 금지.
- 기본은 아이콘+텍스트. 아이콘 단독은 aria-label+tooltip+44×44px, 장식은 aria-hidden.
- 색만으로 상태 전달 금지(텍스트/아이콘 병행), 비텍스트 대비 3:1·텍스트 4.5:1.
- `src/ui/icons.ts`는 액션별 `IconSpec` named export만 제공한다(집계 객체·default export 금지, tree-shaking 보존).
- `IconSpec`: `{ icon, size: 16|20|24, aria: 'hidden'|'label', labelKey? }`. aria='label'일 때 labelKey 필수.
- 액션→아이콘 매핑은 DESIGN.md §4 매핑표(준비 보고서 §2)를 정본으로 한다.

## 결과
- 긍정: 단일 계열·역할표·접근성 계약 확정, 후속 Slice B/C가 동일 상수를 재사용.
- 부정/제약: 화면 적용은 Slice B/C, 5폭/200% 시각 검증은 해당 PR에서 수행.

## 대안과 금지 사항
- Octicons/heroicons/이모지/임의 SVG 혼합 금지. ADR + notices 갱신 없이 새 계열 추가 금지.
- `src/ui/icons.ts`를 단일 객체로 묶어 tree-shaking 저해 금지. ADR-0064 본문 수정 금지(승계).

## 참고
- DESIGN.md §4, `src/ui/icons.ts`, `tests/unit/ui/icons.test.ts`, 이슈 #233.