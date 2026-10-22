---
id: ADR-0092
title: Pele 해설 Mermaid 전수 교차 검증과 전환 시점 재정의
status: Accepted
date: 2026-10-22
related: ["#335", "#168", "ADR-0045", "ADR-0047"]
---

# ADR-0092: Pele 해설 Mermaid 전수 교차 검증과 전환 시점 재정의

## 배경
- ADR-0047은 Pele 전환 구현 시점을 2026-10-22 이후·0.3.0 후속으로 정했지만, 사용자가 #335 처리에서 기존 renderer를 Pele로 확정하고 전체 해설 Mermaid 교차 검증을 직접 지시했다.
- #168 inventory 기준 문제은행에는 71개 Mermaid 블록이 있다. #335는 모바일 Safari에서 sequence 렌더가 실패한 증거를 보고했으므로 실제 WebKit 검증과 콘텐츠 문법 분류가 필요하다.

## 결정
- #335 수정의 Mermaid renderer는 Pele 1.7.0 `pele/lazy`로 한다. ADR-0047의 **시점 조항만** 대체한다. ADR-0045·0047의 지원·보안·접근성·폴백·성능 검증 조건은 유지한다.
- 콘텐츠 인벤토리의 모든 71개 블록을 Chromium과 WebKit에서 각각 폭 320, 375, 768, 1280px로 검증한다. ADR-0047의 기존 1024px 조건도 보존한다.
- 각 조합에서 Pele SVG 생성, sanitizer 통과, SVG DOM 표시, 카드·페이지 overflow 및 브라우저 오류를 확인한다. 실패는 questionId·packId·diagram type·브라우저·폭으로 분리 기록하고, 원인이 콘텐츠 문법이면 UI 수정과 분리한 콘텐츠 수정 목록으로 남긴다. 실패를 제외하거나 fallback 성공으로 치환해 렌더 성공으로 집계하지 않는다.
- 이슈의 한글 participant·presigned URL sequence fixture도 같은 WebKit 경로로 확인한다. 잘못된 문법의 안전한 원문 fallback·접근성·XSS 차단은 기존 계약을 유지한다.
- 71개 전체 검증 및 필수 일반/악성 샘플이 모두 통과하기 전에는 Pele 전환을 완료·배포로 선언하지 않는다. 이 결정은 DB 수정, 배포 승인, Mermaid와 Pele 이중 renderer의 장기 유지를 허용하지 않는다.

## 결과
- 긍정: 실제 콘텐츠 전체와 iPhone 폭을 포함한 Chromium/WebKit에서 renderer·sanitizer 경로를 함께 확인하고, 코드 결함과 콘텐츠 문법 결함을 구분한다.
- 부정/제약: 710개 viewport-browser-diagram 실행과 스크린샷/실패 분류에 추가 시간이 든다. WebKit 실행 환경과 실제 화면 확인이 필요하다.

## 대안과 금지 사항
- ADR-0047의 0.3.0 시점 유지 — 이번 #335에 대한 사용자의 직접 지시와 충돌해 기각한다.
- 일부 대표 도식만 확인하거나 Chromium 결과로 WebKit을 대체 — 금지한다.
- 실패한 원문을 검증 집계에서 빼거나 renderer fallback을 정상 SVG로 간주 — 금지한다.

## 참고
- #335(iPhone sequence 렌더 실패), #168(71개 도식 inventory), ADR-0045(Pele 렌더 계약), ADR-0047(기존 전체 전환 조건)
