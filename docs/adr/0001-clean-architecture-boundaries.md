---
id: ADR-0001
title: Clean Architecture 계층 경계와 책임
status: Accepted
date: 2026-10-18
related: ["#1", "#10", "#12"]
---

# ADR-0001: Clean Architecture 계층 경계와 책임

## 배경
- 단일 Cloudflare Worker에서 React SPA(정적 자산)와 Hono API를 함께 서빙한다. SPA와 서버 코드가 한 저장소에 공존하므로 계층 혼재 위험이 크다.
- 여러 에이전트 세션이 구현하므로 파일 위치·의존 방향·금지 라이브러리를 문서가 아니라 검사로 강제할 필요가 있다.

## 결정
- `src/`를 `ui/`, `app/`, `domain/`, `infra/`, `bootstrap/` 5계층으로 분리한다.
  - `domain/`: 순수 TS 엔티티·VO·규칙. 프레임워크·DB·네트워크 import 금지(Drizzle 스키마 타입·Zod 런타임 모델 직접 의존 금지).
  - `app/`: use case와 Port(UserRepository, SessionRepository, OidcVerifier 등). `domain`만 의존하고 TanStack Query/Zustand/Hono/Drizzle/Pino/암호화 라이브러리를 import하지 않는다.
  - `infra/`: Hono 라우트·미들웨어, Kakao OIDC 어댑터, Drizzle D1 저장소, PASETO·쿠키 구현. app Port를 구현한다.
  - `ui/`: AntD 6 화면·라우팅·ViewModel·API client. 도메인 규칙 재구현, D1·Kakao 토큰 직접 접근, PASETO 노출을 금지한다.
  - `bootstrap/`: composition root(Worker 조립과 React bootstrap). 비즈니스 규칙 금지.
- 의존 방향: 논리 흐름 `ui → app → domain`, 요청 경로 `ui(Ky) → HTTP → infra(Hono) → app use case → domain/Port`. `app`/`domain` → `infra`/`ui` 역방향 import 금지.
- API 계약: `GET /auth/kakao`, `GET /auth/kakao/callback`, `GET /api/me`, `POST /auth/logout`.
- 강제 수단: `dependency-cruiser`를 `check:architecture` 정식 CI 게이트로 사용한다(임시 `check-imports.mjs`는 보조로 강등, #10). 브라우저 번들에 서버 코드·Cloudflare 바인딩이 유입되지 않도록 번들 검사를 병행한다(#12).

## 결과
- 긍정: 테스트 격리(fake Port), 저장소·공급자 교체 가능, 에이전트 작업 간 일관성.
- 부정/제약: 초기 보일러플레이트와 매퍼·Port 작성 비용. 계층 판단이 애매한 코드는 리뷰 기준이 추가로 필요하다.

## 대안과 금지 사항
- 계층 없는 단일 폴더 구조 — 테스트·교체 비용이 커져 채택하지 않는다.
- UI에서 서버 로직(PASETO 검증·D1 접근) 재구현 — 금지.
- 계층 검사 없는 운영 — CI 차단이 없으면 규칙이 유지되지 않는다(#10).

## 참고
- 이슈 #1, #10, #12 / `AGENTS.md` 아키텍처 계약 / `architecture-boundaries` 스킬.
