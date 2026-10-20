---
id: ADR-0053
title: 도식 로딩·오류 안내 AT 노출
status: Accepted
date: 2026-10-20
related: ["#179", "#148", "ADR-0045", "ADR-0047"]
---

# ADR-0053: 도식 로딩·오류 안내 AT 노출

## 배경
- `MermaidDiagram` 로딩 `status`·실패 `alert`+원문이 `role=img` 하위라 AT에서 감춰질 수 있다(#179, #148).
- 성공 도식만 이미지 의미를 갖고 로딩/오류는 상태·오류 안내로 인지돼야 한다.

## 결정
- `role=img`+`aria-label`은 성공 SVG에만 둔다. 로딩·실패 래퍼는 `img` 역할을 제거한다.
- 로딩 `status`·실패 `alert`+`pre/code`를 `img` 밖 시맨틱 영역에 둔다. 문구는 `copy.ts` 재사용이다.
- 폭 측정·`ResizeObserver`·비동기 cancel·언마운트 경합·원문 폴백을 유지한다. 성공 시 중복 live·영구 busy를 두지 않는다.
- `diagram-sanitize` 보안 정책·`clip-path`/`marker-end` 확장은 범위 밖이며 fail-closed를 유지한다.

## 결과
- 긍정: 로딩/실패 안내 AT 노출, 성공 접근 이름 유지, 기존 경합·폴백 계약 유지.
- 부정/제약: 내부 SVG `title`/`desc`는 `img` 하위 presentational로 취급, 별도 live로 중복 공지하지 않는다.

## 대안과 금지 사항
- `img` 안에 `status`/`alert` 유지안: AT 감춤 위험으로 기각.
- 성공 래퍼에 `aria-busy` 상시 유지안: 영구 busy 위험으로 기각. 새 하드코딩 문구 금지.

## 참고
- `src/ui/study/Explanation.tsx`, `tests/ui/explanation-announcement.test.tsx`, DESIGN.md 7장·9장.
