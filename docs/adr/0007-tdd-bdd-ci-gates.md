---
id: ADR-0007
title: TDD/BDD와 CI 게이트
status: Superseded by ADR-0043
date: 2026-10-18
related: ["#1", "#5", "#10"]
---

# ADR-0007: TDD/BDD와 CI 게이트

## 배경
- 다중 에이전트 작업에서 "통과처럼 보이는" 상태(테스트 미실행 성공)를 차단해야 한다. 완료 정의는 실행 결과로 증명되어야 한다.

## 결정
- 각 이슈 Acceptance Criteria를 Given/When/Then으로 먼저 정의하고 Red → Green → Refactor 순서로 구현한다. PR에 테스트 위치/명령/결과(스크린샷 포함)를 기록한다.
- 계층별 도구: domain/app=Vitest(fake Port), ui=React Testing Library, infra(Worker/D1)=`@cloudflare/vitest-plugin` + fake Kakao 응답, 브라우저=Playwright + playwright-bdd.
- CI 게이트: `lint`/`typecheck`/`check:architecture`/`test:unit`/`test:integration`/`test:bdd`/`build`. scaffold 이전 임시 예외의 종료 조건을 문서화하고, 이후에는 **미정의 스크립트·스킵을 실패로 처리(fail-closed)**한다(#10). `test:bdd`를 성공만 반환하는 placeholder로 두지 않는다 — 0.1.0부터 홈/health/API smoke가 실제 실행된다.
- CI는 실제 Kakao 계정을 사용하지 않는다(deterministic fake OIDC). 실계정 smoke는 배포 환경에서 별도 수행한다(#5).
- 브라우저 검증 viewport: 핵심 화면(로그인/취소/오류/로그아웃)은 320/375/768/1024/1280 전부, 보조 시나리오는 375/768/1280.
- 실패 시 trace/screenshot 아티팩트를 보존하고, 기본 재시도 0으로 시작한다(플레이크 은폐 방지).

## 결과
- 긍정: 완료 판정이 실행 증거에 묶임, 회귀 조기 발견.
- 부정/제약: 초기 테스트 인프라 비용과 BDD 스텝 유지보수.

## 대안과 금지 사항
- 스킵-성공 게이트, 실행되지 않는 placeholder BDD, Kakao 실계정 CI 사용 — 금지.

## 참고
- 이슈 #1, #5, #10 / `tdd-bdd-testing`·`release-deploy-workers` 스킬.
