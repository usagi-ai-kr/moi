# moi

문제 중심 시험 대비 플랫폼 — **약한 데만 또 익히기**
첫 지원 시험: AWS SAA-C03

Cloudflare Workers 단일 배포 단위에서 React SPA(정적 자산) + Hono API를 함께 서빙합니다.

## 현재 버전

- **0.1.4 릴리스 완료**(2026-10-18): Kakao OIDC·D1 사용자 매핑·PASETO 세션·로그인 UI·Workers 배포. tag `v0.1.4` · `release/0.1`.
- 다음 단계: **0.2.x** — `0.2.0` 문제은행 기반 → `0.2.1` 풀이 → `0.2.2` 복습·저장 → `0.2.3` 신고·정정·통계 → `0.2.4` 500문제·출시(최종 patch). 계약은 `ADR-0017`·`0019`·`0020`·`0021`.
- 버전·마일스톤 규칙은 `AGENTS.md`의 버전 규칙을 따른다.

## 문서 위치

| 문서 | 위치 | 용도 |
| --- | --- | --- |
| 최상위 규칙 | `AGENTS.md` | 작업 원칙·브랜치·아키텍처·보안 규칙 |
| 기술 결정 | `docs/adr/` | ADR(추가 판단·변경 기록) |
| 실행 절차 | `.agents/skills/` | 스킬별 스크립트 사용법 |
| 저장소 운영 체계 | `.github/` | PR·이슈 템플릿 |

## 실행 방법

```sh
pnpm install          # 의존성 설치
pnpm dev              # 로컬 개발 서버
pnpm build            # 프로덕션 빌드 + 브라우저 번들 검사
pnpm test:unit        # 단위·UI 테스트
pnpm test:integration # Worker/D1 통합 테스트
pnpm test:bdd         # Playwright BDD
```

전체 게이트(`lint`·`typecheck`·`check:architecture`·`test:unit`·`test:integration`·`test:bdd`·`build`)는 PR CI에서 fail-closed로 실행된다. 상세는 `AGENTS.md`의 TDD/BDD 규칙을 본다.

## 이슈·PR 흐름

1. 이슈는 `.github/ISSUE_TEMPLATE/` 양식(작업/버그)으로 만든다.
2. 라벨은 `focus`/`instant`/`tuck` 중 하나, Milestone은 반드시 연결한다(생성은 사용자 수동 또는 명시 요청).
3. 기능 브랜치는 `dev`에서 분기해 `dev`로 PR한다(squash merge).
4. `main`은 `dev` → `main` PR(merge commit)로만 반영하며 직접 push 금지.
5. PR 본문은 `.github/pull_request_template.md` 항목(테스트 증거·배포 URL·SHA·blocker)을 채운다.

## 배포·wiki

- 배포: https://moi.qus0in.workers.dev (Cloudflare Workers — SPA + API)
- wiki: https://github.com/usagi-ai-kr/moi/wiki — 릴리스 노트·검증 증거
- 보안 신고·비밀값 취급은 `SECURITY.md`를 본다.
