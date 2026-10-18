---
name: tdd-bdd-testing
description: moi의 TDD(Red→Green→Refactor)와 BDD(Given/When/Then) 실행 규칙. 테스트 작성, 계층별 도구 선택(Vitest/RTL/@cloudflare/vitest-plugin/playwright-bdd), viewport 검증(320~1280), CI 게이트, PR 증거 기록이 필요할 때 사용.
compatibility: Node.js와 pnpm 필요 (scripts/run-gates.mjs).
---

# TDD/BDD 테스트 워크플로

출처: 이슈 #1(실행 규약), #2–#5(단계별 테스트). 관련: `architecture-boundaries`, `release-deploy-workers`.

## 스크립트 (우선 실행 — repo root에서 실행)
- `node .agents/skills/tdd-bdd-testing/scripts/run-gates.mjs [gate ...]` — CI와 동일한 필수 게이트(lint/typecheck/check:architecture/test:unit/test:integration/test:bdd/build)를 로컬에서 순차 실행한다. **fail-closed**: package.json이 있으면(읽기/JSON 오류 포함) 미정의·실패 게이트에서 exit 1, **파일 자체가 없을 때만** 안내 후 exit 0(임시 예외).
- `sh .agents/skills/tdd-bdd-testing/scripts/run-gates.test.sh` — 판정 회귀 테스트(부재→0 · 잘못된 JSON→1 · 미정의→1 · 전 게이트→0).

## 실행 규약
1. 이슈의 Acceptance Criteria를 **Given/When/Then 시나리오로 먼저 정의**하고 재현 가능한 실행 테스트로 구현한다.
2. **Red(실패 테스트) → Green(최소 구현) → Refactor(경계 준수)** 순서를 유지한다.
3. PR에 대응 테스트 위치/실행 명령/결과를 기록한다.
4. CI는 실제 Kakao 계정을 필요로 하지 않도록 외부 OIDC를 deterministic mock으로 대체한다.

## 증거 추적 (AC ↔ feature ↔ test ↔ PR)
- feature/스텝에 이슈 AC 번호를 주석으로 병기해 추적한다.
- PR 본문에 테스트 위치·실행 커맨드·결과(로그·뷰포트 스크린샷)와 남은 blocker를 기록한다.
- 실패 시 비밀정보를 제거한 trace/screenshot 아티팩트를 보존하고 재현 커맨드를 남긴다. 기본 재시도 0(플레이크 은폐 방지).

## 게이트 fail-closed 규칙 (#10)
- scaffold 이후 필수 게이트는 **없거나 스킵이면 실패**다('미정의 스킵-성공' 금지). CI와 `run-gates.mjs`가 동일 규칙을 적용한다.
- 임시 예외는 package.json **파일 부재(ENOENT)**뿐이다. 파일이 존재하나 읽기/JSON 파싱 오류면 실패(exit 1)로 처리한다. package.json이 생성되면 예외는 자동 종료된다.
- `test:bdd`는 실제 실행되는 smoke만 인정한다(0.1.0: 홈/health/API). 로그인 시나리오는 0.1.1~0.1.3에서 누적.
- Cloudflare Worker/D1 통합 테스트는 `@cloudflare/vitest-plugin` + 호환 Vitest 버전을 사용한다(`@cloudflare/vitest-pool-workers` 신규 도입 금지).
- CI job 타임아웃 15분(fail 시 로그·아티팩트 확인).

## 계층별 테스트 도구
| 대상 | 도구 | 방식 |
| --- | --- | --- |
| domain / app | Vitest | fake Port 기반 단위 테스트 |
| UI | React Testing Library | 상태·오류·플로 상호작용 |
| infra (Worker/D1) | @cloudflare/vitest-plugin | 실제 Worker/D1 플러그인 + 가짜 Kakao 응답 통합 테스트 |
| 브라우저 | Playwright + playwright-bdd | 핵심 화면 320/375/768/1024/1280 전부, 보조 375/768/1280 |

## 0.x 단계별 테스트 적용 범위
| 단계 | 필수 |
| --- | --- |
| 0.1.0 | unit/integration smoke + 홈/health/API BDD + 번들 경계 검사 |
| 0.1.1~0.1.3 | 해당 기능 unit/integration + BDD 시나리오 누적(인증·사용자 식별·세션) |
| 0.1.4 | 전체 BDD(핵심 5종 viewport) + 배포 smoke + 실계정 smoke(수동) |

## 필수 테스트 항목 (누적)
- 상태 소유권: TanStack Query `/api/me`가 진실 원천, Zustand에 토큰/중복 사용자 상태 없음.
- Ky: 인증 오류, 중단/타임아웃 처리. 401 → 캐시 재검증/리셋.
- Zod: 잘못된 외부 응답·입력의 4xx/5xx 분류.
- Pino: 비밀정보 미출력(redaction) 검증, thread transport 미사용.
- PASETO: 위조/변조/만료/잘못된 키/폐기 jti/키 회전/로그아웃 재사용 (`session-paseto`).
- OIDC: state/nonce 재사용, 만료/위조 ID token, 잘못된 JWKS 응답 (`kakao-oidc-auth`).
- Drizzle: migration 테스트 (`d1-drizzle-persistence`).

## BDD 시나리오 골격 (0.x)
- Given 비로그인 사용자 When 카카오 인증 성공 Then 내부 user_id에 연결된 인증 세션이 생성된다.
- Given 기존 Kakao 사용자 When 재로그인 Then 새 user_id를 만들지 않는다.
- Given 서로 다른 두 sub When 로그인 Then 서로 다른 user_id를 발급한다.
- Given 불일치 state/nonce 또는 잘못된 ID token When callback Then 로그인 실패하고 세션이 생성되지 않는다.
- Given 비로그인 사용자 When 보호 API 접근 Then 401을 반환한다.
- Given 로그인 사용자 When 로그아웃 Then 서버 세션이 폐기되고 이후 보호 API는 401이다.
- Given 320/375/768/1024/1280 viewport When 로그인·오류 화면 방문 Then 잘리지 않고 조작 가능하다.

## CI 게이트 (전부 통과해야 함 — fail-closed)
`pnpm lint` · `typecheck` · `check:architecture` · `test:unit` · `test:integration` · `test:bdd` · `build`
- 미정의·스킵은 실패다. 0.1.0 scaffold 이전(package.json 부재)만 임시 예외다.

## PR 증거 형식
- 테스트 위치(파일), 실행 명령, 결과(성공/로그), viewport별 스크린샷, 남은 blocker.

## 실계정 검증 분리
- 실제 Kakao 인증은 배포된 스테이징/실서비스에서 별도 smoke 검증한다 (계정/시크릿을 CI에 노출하지 않음). → `release-deploy-workers`
