# AGENTS.md — moi 프로젝트 규칙

**moi**는 문제 중심 시험 대비 플랫폼입니다(첫 지원 시험: AWS SAA-C03). Cloudflare Workers 단일 배포 단위에서 React SPA(정적 자산) + Hono API를 함께 서빙합니다.
이 문서는 이 저장소에서 작업하는 모든 에이전트의 최상위 규칙입니다. 세부 실행 절차는 `.agents/skills/`의 스킬을 따르고, 기술적 판단의 기록은 `docs/adr/`에서 관리합니다.

## 작업 원칙
- 이슈 기반으로 작업한다. 관련 이슈의 Acceptance Criteria(BDD)와 완료 정의를 구현·검증의 기준으로 삼는다.
- 워커는 피처명으로 고정 배치·명명하지 않는다. 기존 워커 풀에서 작성자와 다른 모델이 리뷰·보조·보완한다. 새 에이전트·페인·리뷰어와 범위 밖 작업은 사용자 승인 후에만 한다.
- 문서·이슈·PR·커밋 메시지는 한국어로 작성한다.
- 비밀값·토큰·인가 코드·개인정보를 이슈, 코드, 커밋, CI 로그에 남기지 않는다.
- 계층 검사·테스트·타입 검사가 통과하지 않으면 완료로 표시하지 않는다.
- 완료 정의: 모든 테스트/타입/lint/계층 검사 통과 + 1 Worker 배포 단위 동작 + 버전별 PR에 실행 결과·배포 URL·남은 blocker 보고.

## 하네스·문서 관리
구성 요소와 역할:

| 구성 | 역할 | 위치 |
| --- | --- | --- |
| 룰 | 최상위 규칙 (이 문서) | `AGENTS.md` |
| 스킬 | 실행 절차 + 자동화 스크립트 | `.agents/skills/` |
| ADR | 기술적 판단·변경의 기록 | `docs/adr/` |
| 이슈 | 작업 단위·추적 | GitHub Issues |

관리 규칙:
- **모든 기술적 추가 판단·변경은 ADR로 기록한다.** 기존 결정을 뒤집으면 기존 ADR을 `Superseded by ADR-NNNN`으로 바꾸고 새 ADR을 추가한다(본문 수정 금지, 오탈자 제외). 생성·인덱스 갱신은 `adr-management` 스킬의 스크립트를 사용한다.
- **AGENTS.md 변경은 PR로만 반영한다.** 규칙이 바뀌면 같은 PR에서 관련 스킬·문서를 함께 갱신한다.
- **모든 스킬은 `SKILL.md` + `scripts/` 구조를 가진다.** 반복적·결정적·출력이 큰 작업은 스크립트(sh/python/node)로 구현하고, 에이전트는 스크립트를 호출한 뒤 요약 출력만 읽는다(효율적 입출력·토큰 사용량 최적화). 새 스킬 추가 시 스크립트 1개 이상을 포함하고 아래 스킬 인덱스에 등록한다.
- **스킬은 Agent Skills 표준(https://agentskills.io/specification)을 준수한다**: `name`은 디렉터리명과 일치하는 소문자 kebab-case(64자 이하), `description` 필수(트리거 키워드 포함, 1024자 이하), 본문 길이는 모듈 예산(≤120줄, ADR-0015)을 따른다. 스킬 수정 후 `node .agents/scripts/validate-skills.mjs`로 검증한다.
- **모듈 길이 예산**: AGENTS.md·SKILL.md·ADR + `src/**/*.{ts,tsx,css}`(목표 150/상한 250줄·16KB, 위반 시 분할 신호) 길이는 `harness-budget` 스킬이 검사한다(CI 필수·초과 차단, ADR-0015). 초과 시 ① 중복 제거 ② 스크립트화 ③ 분리 순으로 해소하고, 예산 변경은 ADR 갱신과 함께한다.
- 스킬 실행 명령은 repo root 기준 경로로 표기하고 CWD를 명시한다.
- 이슈 완료 시 확정된 합의를 ADR/AGENTS.md/스킬에 반영(승격)한다. 이슈는 작업 추적용이고, 영속 규칙은 문서에 둔다.
- 우선순위(충돌 시): **사용자가 승인한 이슈 합의 > Accepted ADR > AGENTS.md > 스킬 세부 절차.** 이슈 합의가 문서와 충돌하면 같은 PR에서 ADR supersede·문서 동기화로 반영한다.
- 작업 산출물은 가능한 한 스크립트 실행 + 요약 출력 형태로 남겨 컨텍스트 사용량을 줄인다.

## 이슈 라벨·마일스톤 규칙
- 저장소 템플릿·보호 정비는 **저장소 운영 체계 정비**로 칭한다.
- 모든 이슈는 `focus` / `instant` / `tuck` 중 **하나**로 분류한다. `f`/`i`/`t` 약칭 라벨은 만들지 않는다.
- 결정 순서: ① 핵심 목표 + 집중 필요 → `focus` ② 지금 바로 처리하는 작은 부수 작업 → `instant` ③ 나중에 해도 되는 기록 → `tuck`. 단순 긴급함은 분류 기준이 아니다.
- 라벨은 작업 성격(핵심 집중/즉시 부수/나중 보류) 분류이며 진행 상태(open/blocked/in-progress/closed)를 나타내지 않는다. 진행 상태는 이슈 상태·본문·PR로 관리한다.
- 분류가 바뀌면 라벨을 변경하고 사유를 댓글·PR에 남긴다.
- 검토 결과 라벨(별도 축, 최대 1개): `reviewed`(리뷰 완료 — **승인 아님**), `approved`(기준 충족 승인 — 이슈는 '설계/작업 수용'인지 '완료 증거 확인'인지 댓글로 명시), `rejected`(근거를 남긴 명시적 반려).
- 검토 결과 전이: `reviewed → approved/rejected` 시 이전 검토 라벨을 제거하고 사유·근거(이슈/PR·테스트 증거)를 댓글로 남긴다. `closed`/`merged`와 검토 라벨은 별개다.
- Milestone 생성은 사용자가 GitHub UI에서 직접 한다(사용자가 명시적으로 요청한 경우 에이전트가 대신 생성).
- **모든 이슈는 적절한 Milestone에 연결(부착)한다 — 예외 없음.** 연결은 에이전트가 수행하고, 알맞은 Milestone이 없으면 생성하지 말고 사용자에게 요청한다.
- 상세: `issue-triage` 스킬.

## 브랜치·PR 플로우
- `main`: 안정/배포 브랜치. **직접 push 금지.** `dev` → `main` PR(merge commit)로만 반영한다.
- `dev`: 통합 브랜치. 기능 브랜치는 `dev`에서 분기해 `dev`로 PR한다(squash merge, 병합 후 브랜치 삭제).
- 기능 브랜치 이름: `<type>/<버전 또는 이슈 번호>-<요약>` (소문자 kebab-case). type은 `feat` / `fix` / `chore` / `docs` / `test`.
  - 예: `feat/0.1.1-kakao-oidc`, `fix/12-cookie-path`, `docs/9-harness-doc-sync`
- 모든 병합은 PR을 통한다. PR에는 테스트 위치/명령/결과, 배포 URL, commit SHA, 남은 blocker를 기록한다.
- `main`/`dev` 모두 force push·브랜치 삭제 금지(GitHub 브랜치 보호 규칙으로 강제). 보호 규칙이 적용되지 않는 환경이면 이 규칙을 수동 준수한다.
- CI: 모든 PR(main/dev 대상)과 dev push에서 `.github/workflows/ci.yml`이 실행된다.

## 확정 기술 스택
- TypeScript strict + pnpm
- 프론트엔드: React SPA, Vite, React Router, Ant Design 6
- 백엔드: Hono, Cloudflare Workers (동일 오리진에서 정적 자산 + API 서빙)
- DB: Cloudflare D1 + Drizzle ORM (마이그레이션 파일 버전 관리)
- 테스트: Vitest(도메인·앱), React Testing Library(UI), @cloudflare/vitest-plugin(Worker/D1), Playwright + playwright-bdd(브라우저)
- 계층 의존성 검사: dependency-cruiser(`check:architecture`), CI에서 차단
- 초기 범위 도입 금지: SSR, 별도 API 서버, 마이크로서비스, Redux, Kakao JS SDK

## 아키텍처 계약 (요약)
- `src/` 기준 `ui/`, `app/`, `domain/`, `infra/`, `bootstrap/` 분리 — `bootstrap`은 `bootstrap/web`(브라우저 진입)·`bootstrap/worker`(Worker 진입).
- 실행 환경 경계: 브라우저 번들에는 `ui`(+`ui/api`)·`bootstrap/web`과 사이드이펙트 없는 공유 타입/DTO만 — `infra`·Cloudflare 바인딩·Secret 유입 금지(번들 검사로 차단). → `architecture-boundaries`, ADR-0011
- 의존 방향: 논리 흐름 `ui → app → domain`. Worker 호출은 `ui(타입 안전 API client) → infra(Hono) → app(use case)`. `app`/`domain`에서 `infra`/`ui`로의 역방향 import 금지.
- API: `GET /auth/kakao`, `GET /auth/kakao/callback`, `GET /api/me`, `POST /auth/logout`
- 상세(계층별 허용/금지 라이브러리): `architecture-boundaries` 스킬, ADR-0001.

## 보안·데이터 규칙 (요약)
- 외부 인증: Kakao OAuth2 Authorization Code + OIDC, 서버 측 code 교환, state·브라우저 바인딩·nonce 검증(D1 `oauth_states` 원자적 일회성 소비, PKCE S256), ID token JWKS 서명 + iss/aud/exp 검증. → `kakao-oidc-auth`, ADR-0003
- 내부 세션: PASETO v4.local(절대 만료 24시간, jti 해시 D1 폐기). `__Host-` + Secure + HttpOnly + SameSite=Lax + Path=/ 쿠키. 자체 JWT 발급·opaque session 대체·JWT fallback 금지. → `session-paseto`, ADR-0005
- 식별: 내부 UUID `user_id`가 데이터 소유권 기준. `(provider='kakao', provider_subject=sub)` UNIQUE. 이메일/닉네임은 핵심키가 아니며 동의를 필수화하지 않는다. → `d1-drizzle-persistence`, ADR-0004
- 저장·로그: PASETO 원문 저장 금지(D1에는 jti 해시만), 서버 비밀값은 Cloudflare Secrets만 사용, Pino redaction으로 토큰·쿠키·인가 코드·Secret 제거. → ADR-0006
- 브라우저에 PASETO/앱 토큰을 노출하거나 localStorage/sessionStorage에 저장하지 않는다. 앱 인증 상태의 진실 원천은 서버(`/api/me`)다.

## TDD/BDD 규칙 (요약)
- AC → Given/When/Then 시나리오 먼저 정의 → Red → Green → Refactor. PR에 테스트 위치/실행 명령/결과를 기록한다.
- 브라우저 검증 viewport: 핵심 화면은 320 / 375 / 768 / 1024 / 1280 전부, 보조 시나리오는 375 / 768 / 1280. (모바일 320–767 / 태블릿 768–1199 / 데스크탑 1200+)
- CI는 실제 Kakao 계정을 사용하지 않는다(deterministic mock). 실계정 smoke는 배포된 스테이징/실서비스에서 별도 수행한다.
- CI 게이트: `.github/workflows/ci.yml` — 스킬 검증은 항상 실행한다. `package.json` 부재(0.1.0 이전)만 임시 예외로 건너뛰고, 이후에는 **미정의·스킵 게이트를 실패로 처리(fail-closed)**한다. → `tdd-bdd-testing`, #10
- 상세: `tdd-bdd-testing`, `release-deploy-workers` 스킬, ADR-0007.

## 버전 규칙
- 0.1.x 단계(패치 재편): `0.1.0` 하네스 보강(#9~#12)·scaffold → `0.1.1` Kakao OIDC → `0.1.2` D1 사용자 매핑 → `0.1.3` 세션·인증 API → `0.1.4` BDD 통합·배포. GitHub Milestone `0.1.0`~`0.1.4`가 각 단계와 대응한다.
- 0.2.0 단계(학습 제품): `0.2.0 — AWS SAA-C03 학습 제품` (PR #35 계약, ADR 번호는 병합 시 확정).
- 0.2.0 이후 minor 확장은 추상 `1.0.0` Milestone을 placeholder로 사용하고, 범위 확정 시 해당 minor Milestone(예: `0.3.0`)을 만든다.
- 각 minor의 최종 patch는 wiki 페이지·annotated tag(`v<minor>.<patch>`)·GitHub Release·`release/<minor>` branch를 모두 남긴다. 넷 중 하나라도 없으면 릴리스 완료가 아니다.
- 우선순위 근거: GitHub Milestone(`0.1.0`~`0.1.4`, `0.2.0`, 추상 `1.0.0`)과 이슈 본문의 선행 링크. Milestone이 없으면 이슈 본문 버전이 근거다. → ADR-0008

## 스킬 인덱스

| 스킬 ID | 언제 로드 |
| --- | --- |
| `issue-triage` | 새 이슈 생성·분류, 라벨 결정, milestone 관련 요청 |
| `adr-management` | 기술 결정 기록(ADR) 생성·갱신, ADR 인덱스 관리 |
| `architecture-boundaries` | 모듈/폴더 추가, import 경계, 계층 검사 설정, 라이브러리 책임 판단 |
| `frontend-responsive-ui` | 로그인·오류·로그아웃 등 화면 구현, 반응형·접근성·UI 상태 관리 |
| `kakao-oidc-auth` | `/auth/kakao*` 구현·수정, OIDC 검증, Kakao 연동 테스트 |
| `session-paseto` | 세션 발급·검증·폐기, 쿠키, `/api/me`, 로그아웃, 키 관리 |
| `d1-drizzle-persistence` | 스키마/마이그레이션/Repository 어댑터, D1 쿼리 |
| `tdd-bdd-testing` | 테스트 작성, BDD 시나리오, CI 게이트, PR 증거 |
| `release-deploy-workers` | Workers 배포, 원격 D1 마이그레이션, Secrets, smoke 검증 |
| `harness-budget` | 모듈 길이 예산 검사·해소, 하네스 비대화 방지 |

> 이 규칙과 스킬은 GitHub 이슈 #1–#13 및 사용자 확정 사항(브랜치·PR 플로우, 하네스·문서 관리, 스킬 스크립트 정책, 2026-10-18)에서 추출했습니다. 초기 결정은 `docs/adr/` ADR-0001–0010으로 백필합니다(이슈 #1 첫 PR·#9 추적). 이슈 내용과 충돌하면 이슈의 최신 합의를 우선하고, 합의된 변경을 문서에 반영합니다.
