---
id: ADR-0002
title: 확정 기술 스택
status: Accepted
date: 2026-10-18
related: ["#1", "#10"]
---

# ADR-0002: 확정 기술 스택

## 배경
- 0.1.x(카카오 로그인·사용자 식별) 구현 전에 스택을 고정해 재작업을 막는다.
- Cloudflare Workers 단일 배포 단위에서 SPA+API를 서빙하는 제약이 있다.

## 결정
- 언어/패키지: TypeScript strict, pnpm(`packageManager` 정확 버전 고정 + lockfile), Node 22 기준.
- 프론트엔드: React SPA, Vite, React Router, Ant Design 6. 서버 상태는 TanStack Query, 클라이언트 UI 상태는 Zustand, HTTP는 Ky(same-origin 단일 클라이언트).
- 백엔드: Hono + Cloudflare Workers(동일 오리진 정적 자산 + API), Zod 입력 검증, Pino 구조화 로그(Worker 호환, thread transport 금지).
- DB: Cloudflare D1 + Drizzle ORM. 스키마·마이그레이션 SQL을 커밋한다(순방향).
- 테스트: Vitest(domain/app), React Testing Library(ui), `@cloudflare/vitest-plugin`(Worker/D1 — 2026-08부터 공식, `@cloudflare/vitest-pool-workers` 신규 도입 금지), Playwright + playwright-bdd(브라우저).
- 계층 검사: dependency-cruiser(ADR-0001).
- 초기 범위 도입 금지: SSR, 별도 API 서버, 마이크로서비스, Redux, Kakao JS SDK.

## 결과
- 긍정: Worker 단일 배포로 운영 단순화, 테스트 도구의 계층별 책임 분리.
- 부정/제약: Workers 런타임 제약(번들·Node API)을 라이브러리 선택마다 확인해야 한다(PASETO 호환 스파이크 등).

## 대안과 금지 사항
- SSG/SSR 프레임워크, 별도 API 서버, 초기 monorepo 분리 — 금지.
- JWT/opaque 기반 자체 세션 — ADR-0005로 금지.

## 참고
- 이슈 #1 / `AGENTS.md` 확정 기술 스택 / Cloudflare Workers 공식 문서.
