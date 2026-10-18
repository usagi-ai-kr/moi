---
name: architecture-boundaries
description: moi의 Clean Architecture 계층 규칙. 새 모듈·폴더 추가, import 경계 판단, 계층별 허용/금지 라이브러리 확인, dependency-cruiser 설정·검사, 코드 리뷰 시 사용.
compatibility: Node.js 필요 (scripts/check-imports.mjs).
---

# 아키텍처 경계와 라이브러리 책임

출처: 이슈 #1(2026-10-18 추가 아키텍처 결정 포함). 계층 위반은 CI에서 차단한다.

## 스크립트 (우선 실행 — repo root에서 실행)
- `node .agents/skills/architecture-boundaries/scripts/check-imports.mjs` — `src/` 계층 import 위반 **보조 점검**(단일 행·별칭 휴리스틱 — 단독 게이트 금지). 정식 게이트는 dependency-cruiser(`check:architecture`, #1 scaffold에서 구성·#10). 위반 시 exit 1, src/ 없음(0.1.0 이전)은 exit 3 안내.

## 계층 구조 (`src/`)

| 계층 | 책임 | 금지 |
| --- | --- | --- |
| `domain/` | User, ExternalIdentity 등 엔티티/VO/비즈니스 규칙 (순수 TS) | 프레임워크·DB·네트워크 import, Drizzle 스키마 타입 직접 참조, Zod/런타임 DB 모델 직접 의존 |
| `app/` | use case(LoginWithKakao, GetCurrentUser, Logout) + Port(UserRepository, SessionRepository, OidcVerifier). `domain`만 의존 | TanStack Query/Zustand/Hono/Drizzle/Pino/암호화 라이브러리 직접 import |
| `infra/` | Hono 라우트·미들웨어, Kakao OIDC 어댑터, Drizzle D1 저장소, 세션·쿠키 구현. app Port 구현 | 도메인 규칙 재구현 |
| `ui/` | AntD 6 컴포넌트, 로그인 페이지, 라우팅, ViewModel/API client | 도메인 규칙 재구현, D1·Kakao 토큰 직접 접근, PASETO 노출/저장 |
| `bootstrap/` | Worker 의존성 주입/라우팅 조립, React 앱 bootstrap (composition root) | 비즈니스 규칙 |

## 의존성 방향
- 논리 흐름: `ui → app → domain`.
- Worker 요청 경로: React 컴포넌트 → query/usecase facade → Ky client → Hono middleware → app usecase → Domain/Port/Drizzle.
- `app`/`domain`에서 `infra`/`ui`로의 역방향 import 금지.
- 계층 위반은 CI에서 `check:architecture`(dependency-cruiser) **실패**로 차단한다. 위반 테스트에 직접 import·별칭 경유·재export·type-only import를 포함한다(#10 → #1).

## 계층별 라이브러리 책임 (핵심)
- **TanStack Query** (`ui/`): 서버 상태(`/api/me`) 캐시·재검증·무효화. **사용자 인증 여부의 진실 원천은 서버.**
- **Zustand** (`ui/`): 토스트·대화상자·화면 단계 등 일시적 UI 상태만. 로그인 상태/토큰 영속 저장 금지.
- **Ky** (`ui/infra/http` 성격의 프런트엔드 어댑터): 단일 same-origin 클라이언트. credentials, timeout, AbortSignal, 표준화된 오류 처리. UI 코드에서 fetch/ky 분산 직접 호출 금지. 401 → TanStack Query 캐시 재검증/리셋.
- **Hono + Zod** (`infra/http`): 라우트 입출력·환경변수·외부 Kakao 응답 검증(@hono/zod-validator 허용). domain의 값 객체 불변식과는 구분.
- **Pino** (`infra/http`): 구조화 로깅 + requestId. Workers에서 `pino.transport()`/thread-stream 의존 금지 → Worker 호환 JSON 출력 어댑터, 통합 테스트로 검증. 토큰·쿠키·인가 코드·Secret은 반드시 redaction.
- **Drizzle** (`infra/persistence`): 테이블·마이그레이션·Repository 어댑터. Drizzle은 app Port 구현에만 노출.
- **PASETO** (`infra/auth`): 앱 자체 인증 증명. Kakao이 발행하는 ID token(JWT)은 OIDC 규격대로 검증. PASETO 서명/암복호화는 app Port 뒤에 감춘다.

## API 계약
- `GET /auth/kakao` — Kakao 인가 URL로 302
- `GET /auth/kakao/callback` — OIDC callback
- `GET /api/me` — 세션 사용자 (`Cache-Control: no-store`)
- `POST /auth/logout` — 세션 폐기 + 쿠키 삭제 (Origin/CSRF 검증)

## 확인 체크리스트
- [ ] 새 파일이 계층 폴더와 책임 표에 맞는가?
- [ ] 역방향 import가 없는가? (dependency-cruiser `check:architecture` 통과 — 보조: check-imports.mjs)
- [ ] `app`/`domain`이 금지 라이브러리를 import하지 않는가?
- [ ] UI가 서버 상태(TanStack Query)와 UI 상태(Zustand)를 올바른 도구로 나누었는가?
- [ ] API client 호출이 Ky 어댑터 한 곳으로 모여 있는가?
