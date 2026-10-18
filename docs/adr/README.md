# Architecture Decision Records (ADR)

moi의 **모든 기술적 추가 판단·변경**은 이 디렉터리에 ADR로 기록한다. (규칙: `AGENTS.md` 하네스·문서 관리, ADR-0010)

## 규칙
- 파일명: `NNNN-kebab-slug.md` (4자리 순차 번호). 제목은 한국어.
- 생성: `sh .agents/skills/adr-management/scripts/new-adr.sh <slug> "<제목>"` — `template.md` 기반으로 다음 번호가 자동 부여된다.
- 인덱스 갱신: `python3 .agents/skills/adr-management/scripts/adr-index.py` — 아래 표를 프런트매터에서 자동 재생성한다.
- 상태값: `Proposed`(제안) → `Accepted`(합의·적용) → `Deprecated`(폐기) 또는 `Superseded by ADR-NNNN`(대체됨).
- 기존 결정을 변경할 때: 기존 ADR 상태를 `Superseded by ADR-NNNN`으로 바꾸고 새 ADR을 추가한다. 기존 본문은 수정하지 않는다(오탈자 등 비의미 변경만 허용).
- 기능 구현 이슈에서 내린 기술 판단도 PR에서 ADR 추가/갱신 여부를 확인한다. ADR 없는 기술 변경은 완료로 보지 않는다.
- 우선순위: 최신 ADR > `AGENTS.md` > 스킬 세부 절차.

## 인덱스

<!-- ADR_INDEX:START -->
| ADR | 제목 | 상태 | 날짜 | 파일 |
| --- | --- | --- | --- | --- |
| ADR-0001 | Clean Architecture 계층 경계와 책임 | Accepted | 2026-10-18 | [0001-clean-architecture-boundaries.md](./0001-clean-architecture-boundaries.md) |
| ADR-0002 | 확정 기술 스택 | Accepted | 2026-10-18 | [0002-confirmed-tech-stack.md](./0002-confirmed-tech-stack.md) |
| ADR-0003 | Kakao OAuth2 Authorization Code + OIDC 인증 | Accepted | 2026-10-18 | [0003-kakao-oidc-auth-flow.md](./0003-kakao-oidc-auth-flow.md) |
| ADR-0004 | 내부 사용자 ID와 외부 계정 매핑 | Accepted | 2026-10-18 | [0004-internal-user-identity-mapping.md](./0004-internal-user-identity-mapping.md) |
| ADR-0005 | 앱 세션 PASETO v4.local | Accepted | 2026-10-18 | [0005-paseto-v4-local-session.md](./0005-paseto-v4-local-session.md) |
| ADR-0006 | 비밀값·로그·개인정보 정책 | Accepted | 2026-10-18 | [0006-secrets-logging-policy.md](./0006-secrets-logging-policy.md) |
| ADR-0007 | TDD/BDD와 CI 게이트 | Accepted | 2026-10-18 | [0007-tdd-bdd-ci-gates.md](./0007-tdd-bdd-ci-gates.md) |
| ADR-0008 | 버전 규칙과 Milestone 체계 | Superseded by ADR-0017 | 2026-10-18 | [0008-version-and-milestones.md](./0008-version-and-milestones.md) |
| ADR-0009 | 브랜치·PR 플로우 | Accepted | 2026-10-18 | [0009-branch-pr-flow.md](./0009-branch-pr-flow.md) |
| ADR-0010 | 하네스·문서 관리 체계 | Accepted | 2026-10-18 | [0010-harness-doc-management.md](./0010-harness-doc-management.md) |
| ADR-0011 | UI/Worker 실행 환경 경계와 배포 검증 계약 | Accepted | 2026-10-18 | [0011-runtime-boundary-release-contract.md](./0011-runtime-boundary-release-contract.md) |
| ADR-0012 | 디자인 시스템 — AWS 팔레트·KoddiUD 온고딕/Inter·레이아웃·모션 | Accepted | 2026-10-18 | [0012-design-system-aws-koddiud-inter.md](./0012-design-system-aws-koddiud-inter.md) |
| ADR-0013 | 하네스 모듈 길이 예산 — 검사·관리 자동화 | Superseded by ADR-0015 | 2026-10-18 | [0013-harness-module-length-budget.md](./0013-harness-module-length-budget.md) |
| ADR-0014 | 디자인 시스템 보강 — 폰트 제공·UI 제약 예외·여백·Lighthouse·카카오 버튼 | Accepted | 2026-10-18 | [0014-design-system-supplement-font-ui-kakao.md](./0014-design-system-supplement-font-ui-kakao.md) |
| ADR-0015 | src 모듈 길이 예산 — 하네스·src 통합 | Accepted | 2026-10-18 | [0015-src-module-length-budget.md](./0015-src-module-length-budget.md) |
| ADR-0016 | Kakao OIDC 구현 — 상태 소비·JWKS 검증·응답/로그 계약 | Accepted | 2026-10-18 | [0016-kakao-oidc-implementation.md](./0016-kakao-oidc-implementation.md) |
| ADR-0017 | 0.2.0 버전·거버넌스·출시 게이트 | Accepted | 2026-10-18 | [0017-version-governance-0.2.0.md](./0017-version-governance-0.2.0.md) |
| ADR-0018 | 세션·UI 상태 계약 — 서버 진실 원천과 캐시 규칙 | Accepted | 2026-10-18 | [0018-session-ui-state-contract.md](./0018-session-ui-state-contract.md) |
| ADR-0019 | 0.2.0 문제은행·품질·관리 API | Accepted | 2026-10-18 | [0019-question-bank-quality.md](./0019-question-bank-quality.md) |
| ADR-0020 | 0.2.0 20문제 풀이·오답/북마크 복습 | Accepted | 2026-10-18 | [0020-study-and-review.md](./0020-study-and-review.md) |
| ADR-0021 | 0.2.0 저장·복구·단일 세션·신고·정정·통계 | Accepted | 2026-10-18 | [0021-storage-reports-stats.md](./0021-storage-reports-stats.md) |
| ADR-0022 | 디스플레이 폰트 LCP 안정화 — optional·지연 주입 | Accepted | 2026-10-18 | [0022-display-font-lcp-stability.md](./0022-display-font-lcp-stability.md) |
<!-- ADR_INDEX:END -->
