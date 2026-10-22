# AGENTS.md — moi 프로젝트 규칙

**moi**는 문제 중심 시험 대비 플랫폼입니다. Cloudflare Workers 단일 배포 단위에서 React SPA(정적 자산) + Hono API를 함께 서빙합니다.
UI·UX 기준은 `DESIGN.md`이며, Lighthouse만으로 디자인 완료를 판정하지 않는다. shadcn/Tailwind 전환 검토는 ADR-0035·#148.
이 저장소에서 작업하는 모든 에이전트의 최상위 규칙이다. 세부 절차는 `.agents/skills/`, 기술적 판단은 `docs/adr/`가 관리한다.

## 작업 원칙
- 이슈 기반으로 작업한다. AC(BDD)와 완료 정의를 구현·검증 기준으로 삼는다.
- 워커는 피처명으로 고정 배치하지 않는다(o=디스패치·수락, r=리뷰, w1~w3=구현). 완료·blocked·failed는 `[callback]`으로 o에 알리고, 단위마다 컨텍스트를 리셋해 교차 리뷰·검증 후 병합한다. 새 에이전트·리뷰어·범위 밖 작업은 승인 후에만. → `agent-orchestration`
- 문서·이슈·PR·커밋 메시지는 한국어로 작성한다.
- 비밀값·토큰·인가 코드·개인정보를 이슈, 코드, 커밋, CI 로그에 남기지 않는다.
- 계층 검사·테스트·타입 검사가 통과하지 않으면 완료로 표시하지 않는다.
- 완료 정의: 모든 테스트/타입/lint/계층 검사 통과 + 1 Worker 배포 단위 동작 + 버전별 PR에 실행 결과·배포 URL·남은 blocker 보고.
- 에이전트 코멘트≠승인.
- 단위 묶음 완료(전 PR merge·배포·smoke·이슈 close) 통지는 **o만** 1회 보낸다. → `orchestrator-completion-notify`, ADR-0075. 단위별 알림 금지, 실패는 merge를 되돌리지 않고 blocker로 보고한다.

## 하네스·문서 관리
- 구성: 룰 `AGENTS.md` · 스킬 `.agents/skills/` · ADR `docs/adr/` · 이슈 GitHub Issues.
- 모든 기술적 추가 판단·변경은 ADR로 기록한다. 기존 결정 변경은 `Superseded by ADR-NNNN` + 새 ADR. → `adr-management`
- AGENTS.md 변경은 PR로만 반영한다. 스킬은 Agent Skills 표준(`SKILL.md` + `scripts/`)을 따르고, 수정 후 `validate-skills.mjs`로 검증한다. → ADR-0015
- 모듈 길이 예산(AGENTS.md·SKILL.md·ADR·`src/**`)은 `harness-budget`이 검사한다(CI 필수·초과 차단). → ADR-0015
- 임시 문서·보고서·인수인계는 `tmp/`에 둔다. → ADR-0051
- 우선순위(충돌 시): 사용자가 승인한 이슈 합의 > Accepted ADR > AGENTS.md > 스킬 세부 절차.

## 이슈 라벨·마일스톤 규칙
- 모든 이슈는 `focus` / `instant` / `tuck` 중 하나로 분류한다. 약칭 라벨 금지.
- 결정 순서: ① 핵심 목표+집중 필요 → `focus` ② 지금 바로 처리하는 작은 부수 작업 → `instant` ③ 나중에 해도 되는 기록 → `tuck`.
- 라벨은 작업 성격 분류이며 진행 상태를 나타내지 않는다. 진행 상태는 이슈 상태·본문·PR로 관리한다.
- 검토 결과 라벨(별도 축, 최대 1개): `reviewed`(리뷰 완료, 승인 아님) / `approved`(기준 충족) / `rejected`(근거 있는 반려). 전이 시 이전 라벨 제거.
- Milestone 생성은 사용자가 GitHub UI에서 직접 한다(명시 요청 시 에이전트 대행). 모든 이슈는 적절한 Milestone에 부착한다(예외 없음). 알맞은 Milestone이 없으면 생성하지 말고 사용자에게 요청한다.
- 상세: `issue-triage` 스킬.

## 브랜치·PR 플로우
- `main`: 안정/배포 브랜치. 직접 push 금지. `dev` → `main` PR(merge commit)로만 반영한다.
- `dev`: 통합 브랜치. 기능 브랜치는 `dev`에서 분기해 `dev`로 PR한다(squash merge, 병합 후 브랜치 삭제).
- 기능 브랜치 이름: `<type>/<버전 또는 이슈 번호>-<요약>` (소문자 kebab-case). type은 `feat` / `fix` / `chore` / `docs` / `test`.
- 모든 병합은 PR을 통한다. PR에는 테스트 위치/명령/결과, 배포 URL, commit SHA, 남은 blocker를 기록한다.
- `main`/`dev` 모두 force push·브랜치 삭제 금지. CI는 모든 PR(main/dev 대상)과 dev push에서 실행된다.

## 확정 기술 스택
- TypeScript strict + pnpm
- 프론트엔드: React SPA, Vite, React Router, shadcn/ui + Tailwind CSS (ADR-0035, AntD는 과도기)
- 백엔드: Hono, Cloudflare Workers (동일 오리진에서 정적 자산 + API 서빙)
- DB: Cloudflare D1 + Drizzle ORM (마이그레이션 파일 버전 관리)
- 테스트: Vitest(도메인·앱), React Testing Library(UI), @cloudflare/vitest-plugin(Worker/D1), Playwright + playwright-bdd(브라우저)
- 계층 의존성 검사: dependency-cruiser(`check:architecture`), CI에서 차단
- 초기 범위 도입 금지: SSR, 별도 API 서버, 마이크로서비스, Redux, Kakao JS SDK

## 아키텍처 계약 (요약)
- `src/` 기준 `ui/`, `app/`, `domain/`, `infra/`, `bootstrap/` 분리. 의존 방향 `ui → app → domain`; Worker 호출은 `ui → infra(Hono) → app`. 역방향 import 금지.
- 브라우저 번들에는 `ui`(+`ui/api`)·`bootstrap/web`과 공유 타입/DTO만. `infra`·Cloudflare 바인딩·Secret 유입 금지(번들 검사). → `architecture-boundaries`, ADR-0011
- API: `GET /auth/kakao`, `GET /auth/kakao/callback`, `GET /api/me`, `POST /auth/logout`
- 상세(계층별 허용/금지 라이브러리): ADR-0001.

## 보안·데이터 규칙 (요약)
- 외부 인증: Kakao OAuth2 Authorization Code + OIDC, 서버 측 code 교환, state·브라우저 바인딩·nonce 검증, ID token JWKS 검증. → `kakao-oidc-auth`, ADR-0003
- 내부 세션: PASETO v4.local(절대 만료 24시간, jti 해시 D1 폐기), `__Host-` 쿠키. 자체 JWT·opaque session 금지. → `session-paseto`, ADR-0005
- 식별: 내부 UUID `user_id`가 소유권 기준. `(provider='kakao', provider_subject=sub)` UNIQUE. → `d1-drizzle-persistence`, ADR-0004
- 저장·로그: PASETO 원문 저장 금지, 서버 비밀값은 Cloudflare Secrets만, Pino redaction. 브라우저에 앱 토큰 노출·localStorage 저장 금지. 앱 인증 상태의 진실 원천은 서버(`/api/me`). → ADR-0006
- 배포 상시 규칙: `release-deploy-workers` 스킬 참조.

## TDD/BDD 규칙 (요약)
- AC → Given/When/Then → Red → Green → Refactor. PR에 테스트 위치/명령/결과 기록.
- 브라우저 검증 viewport: 핵심 화면 320/375/768/1024/1280, 보조 375/768/1280.
- CI는 실제 Kakao 계정을 사용하지 않는다(deterministic mock). 실계정 smoke는 배포 환경에서 별도 수행.
- CI 게이트: `.github/workflows/ci.yml` — 스킬 검증 항상 실행, 미정의·스킵 게이트는 실패 처리(fail-closed). → `tdd-bdd-testing`, #10
- 상세: `release-deploy-workers` 스킬, ADR-0007.

## 버전 규칙
- 0.1.x: `0.1.0` 하네스 보강·scaffold → `0.1.1` Kakao OIDC → `0.1.2` D1 매핑 → `0.1.3` 세션·인증 API → `0.1.4` BDD 통합·배포. (Milestone 대응)
- 0.2: 0.2.2 저장/복구 → 0.2.3 작성(#134) → 0.2.4 실사용/디자인(#132·#70·#131). → ADR-0030
- 0.3(MS12): #51·#53·#54·#55·#121/#128/#129·#65/#71/#72, 실사용 gate 아님. → ADR-0030
- 0.2.x 이후는 추상 `1.0.0` placeholder. 실사용과 정식완료는 구분; 정식완료 주장 시 wiki·tag·Release·`release/<minor>` 4종 필수.
- 우선순위: Milestone + 선행 링크. → ADR-0030

## 스킬 인덱스

| 스킬 ID | 언제 로드 |
| --- | --- |
| `issue-triage` | 새 이슈 생성·분류, 라벨 결정, milestone 관련 요청 |
| `adr-management` | 기술 결정 기록(ADR) 생성·갱신, ADR 인덱스 관리 |
| `architecture-boundaries` | 모듈/폴더 추가, import 경계, 계층 검사 설정, 라이브러리 책임 판단 |
| `frontend-responsive-ui` | 화면 구현·반응형·접근성·UI 상태 |
| `kakao-oidc-auth` | `/auth/kakao*` 구현·수정, OIDC 검증, Kakao 연동 테스트 |
| `session-paseto` | 세션 발급·검증·폐기, 쿠키, `/api/me`, 로그아웃, 키 관리 |
| `d1-drizzle-persistence` | 스키마/마이그레이션/Repository 어댑터, D1 쿼리 |
| `tdd-bdd-testing` | 테스트 작성, BDD 시나리오, CI 게이트, PR 증거 |
| `release-deploy-workers` | Workers 배포·D1 migration·Secrets·smoke |
| `agent-orchestration` | 역할·콜백·산출물 검증 |
| `orchestrator-completion-notify` | 단위 묶음 완료 Discord 알림 |
| `harness-budget` | 모듈 길이 예산 검사·해소, 하네스 비대화 방지 |
| `harness-eval-report` | 하네스 회고·평가 요약을 usagi 이슈 본문으로 생성 |

> 출처: GitHub #1–#13·사용자 확정(2026-10-18). 초기 결정 `docs/adr/` ADR-0001–0010 백필(#1·#9 추적). 충돌 시 위 규칙 우선.