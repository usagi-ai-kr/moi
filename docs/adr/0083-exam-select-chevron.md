---
id: ADR-0083
title: 시험 Select chevron 여백 — 네이티브 select 유지와 아이콘 배치
status: Accepted
date: 2026-10-21
related: ["#285", "#273", "#233", "ADR-0077", "ADR-0082"]
---

# ADR-0083: 시험 Select chevron 여백 — 네이티브 select 유지와 아이콘 배치

## 배경
- 네이티브 `<select>` UA 화살표가 오른쪽 테두리에 붙어 보였다. 텍스트↔화살표와 화살표↔테두리 간격을 분리 측정해야 했다(#285).

## 결정
- 실제 `<select>`와 label/htmlFor/title/value/onChange/키보드 semantics를 유지한다.
- `moi-exam-select-wrap` relative wrapper + 기존 `iconSelect` ChevronDown(16px, aria-hidden, pointer-events none)을 절대 배치한다.
- `appearance:none`(+webkit), `padding-inline-end:44px`, `inset-inline-end:16px`, 최소 높이 44px.
- 계약: chevron↔테두리 안쪽 ≥12px(실측 15px), 텍스트↔chevron ≥12px(bbox 13px). 시험 1개여도 disabled 금지.
- Chromium 실측(320/375/768/1024/1280·200%, overflow 0). WebKit/Firefox는 바이너리 미설치로 미검증.

## 결과
- 긍정: 오른쪽 여백 결함 해소, 네이티브 접근성 유지.
- 부정/제약: 엔진별·고대비 미검증, bbox CI 자동화는 후속.

## 대안과 금지 사항
- 네이티브 select semantics를 깨는 커스텀 드롭다운으로 대체 금지.
- 시험 1개를 이유로 disabled 처리 금지.

## 참고
- 이슈 #285, #273, #233. ADR-0077, ADR-0082.