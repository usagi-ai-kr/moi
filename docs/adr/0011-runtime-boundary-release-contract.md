---
id: ADR-0011
title: UI/Worker 실행 환경 경계와 배포 검증 계약
status: Accepted
date: 2026-10-18
related: ["#12", "#1", "#5"]
---

# ADR-0011: UI/Worker 실행 환경 경계와 배포 검증 계약

## 배경
- 단일 Worker에서 SPA(브라우저 번들)와 서버 코드가 공존하므로 번들 혼입(서버 구현·Cloudflare 바인딩·Secret) 위험이 있다.
- 배포 검증이 경고(WARN)로 끝나면 거짓 통과가 가능하다(#12). 반응형 검증도 오버플로 도구가 전부를 보증하는 것으로 오해될 수 있다.

## 결정
- `bootstrap`을 `bootstrap/web`(브라우저 진입)·`bootstrap/worker`(Worker 진입)로 분리한다. `ui`(+`ui/api` Ky 클라이언트)·`bootstrap/web`은 사이드이펙트 없는 공유 타입/DTO만 서버와 공유한다.
- 강제: dependency-cruiser(`check:architecture`) + **Vite 번들 검사**(브라우저 번들 내 서버 모듈·`cloudflare:`·Secret 참조 부재) — #1 scaffold에서 테스트로 구성한다.
- smoke는 fail-closed: `/` 200, `/api/me`의 **단일 응답**에서 401 + `Cache-Control: no-store` 동시 검사 — 누락 시 exit 1. 응답 원문(Set-Cookie·토큰) 미출력.
- 릴리스 runbook(순서·중단·복구): 로컬 게이트 → 원격 D1 백업·migration 검증 → Secrets → `wrangler deploy` → Redirect URI 확인 → smoke → 실계정 smoke. 실패 시 다음 단계 중단. 코드는 `wrangler versions rollback`, D1은 forward-only(백업 복원) — 차이를 구분 기록. 초기에는 수동/`workflow_dispatch` 중심.
- 반응형 책임 분리: `check-viewport-overflow`는 **가로 오버플로만** 보증 — 가시성·클릭 가능·포커스·스크린샷 비교는 Playwright 시나리오(핵심 5종 viewport)가 담당한다.

## 결과
- 긍정: 번들 유출·거짓 통과 차단, 배포 절차 재현성과 복구 기준 명확화.
- 부정/제약: 검사·runbook 유지 비용, Playwright viewport 검증 비용 증가.

## 대안과 금지 사항
- 경고만 남기는 smoke 판정, 번들 검사 생략, rollback 절차 미기록 — 금지.

## 참고
- 이슈 #12, #1, #5 / ADR-0001·0007·0009 / `architecture-boundaries`·`release-deploy-workers`·`frontend-responsive-ui` 스킬.
