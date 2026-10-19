---
id: ADR-0034
title: 해설 마크다운·Mermaid 렌더링
status: Accepted
date: 2026-10-19
related: ["#134", "ADR-0011", "ADR-0012", "ADR-0014"]
---

# ADR-0034: 해설 마크다운·Mermaid 렌더링

## 배경
- 해설이 평문 `<p>`로만 노출 — 표·목록·코드·도식 표현 불가.
- Mermaid를 초기 번들에 넣으면 Lighthouse·LCP 악화 우려.

## 결정
- `react-markdown`+`remark-gfm`으로 GFM 렌더, 원시 HTML 미허용.
- `language-mermaid`만 `MermaidDiagram`으로 분기, 동적 로드·1회 init.
- `mermaid.initialize({startOnLoad:false,securityLevel:strict,theme:neutral})`.
- Mermaid SVG만 예외 주입, 실패 시 `<pre><code>` 폴백.

## 결과
- 긍정: 풍부한 해설 표현, 초기 번들 영향 최소, 실패에도 풀이 유지.
- 부정/제약: 첫 도식 렌더 시 지연 로드 비용, SVG 접근성 라벨 의존.

## 대안과 금지 사항
- `rehype-raw`·`dangerouslySetInnerHTML` 임의 HTML 금지, Mermaid 동기 import 금지.

## 참고
- #134 / frontend·tdd 스킬 / `Explanation.tsx`·`ResultView.tsx`.
