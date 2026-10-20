---
id: ADR-0043
title: CI에 THIRD_PARTY_NOTICES --check 게이트 추가
status: Accepted
date: 2026-10-20
related: ["#121", "#10", "#173"]
---

# ADR-0043: CI에 THIRD_PARTY_NOTICES --check 게이트 추가

## 배경
- #173 원인: 의존성 추가 후 고지문 재생성 누락이 CI에서 검출되지 않았다.
- ADR-0026의 `--check` 드리프트 검사가 있어도 게이트에 묶이지 않으면 효력이 없다.

## 결정
- `check:notices`(`node scripts/generate-third-party-notices.mjs --check`)를 필수 게이트로 추가한다.
- `run-gates.mjs`·`ci.yml`·`tdd-bdd-testing` 스킬 목록에 기존 fail-closed 패턴 그대로 포함한다.
- ADR-0007을 본 ADR로 대체한다(게이트 목록 확장, 기존 원칙 유지).

## 결과
- 긍정: 고지문 드리프트·직접 의존성 누락이 PR 단계에서 차단된다.
- 부정/제약: 의존성 변경 PR은 고지문 재생성이 필수라 작업 1단계가 는다.
- 게이트 도입 중 플랫폼 종속성·대소문자 결정성 결함 발견·수정(#174): 빌드 전용 의존성 dev 이동·라이선스 탐색 대소문자 무시.

## 대안과 금지 사항
- 수동 갱신 요청·주기적 검사 — 누락 재발 위험으로 기각. 스킵-성공 허용 금지.

## 참고
- 이슈 #121, #10 / PR #173 / ADR-0007, ADR-0026 / `tdd-bdd-testing` 스킬.
