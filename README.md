# moi — AWS SAA 학습 사이트

Cloudflare Workers 단일 배포 단위에서 React SPA(정적 자산) + Hono API를 함께 서빙하는 AWS Solutions Architect – Associate(SAA-C03) 학습 사이트다.

## 현재 버전

- `0.1.x` 단계: 하네스 보강·인증(Kakao OIDC)·세션(PASETO)·배포 토대 구축 중.
- 버전·마일스톤 규칙은 `AGENTS.md`의 버전 규칙을 따른다.

## 문서 위치

| 문서 | 위치 | 용도 |
| --- | --- | --- |
| 최상위 규칙 | `AGENTS.md` | 작업 원칙·브랜치·아키텍처·보안 규칙 |
| 기술 결정 | `docs/adr/` | ADR(추가 판단·변경 기록) |
| 실행 절차 | `.agents/skills/` | 스킬별 스크립트 사용법 |
| 저장소 위생 | `.github/` | PR·이슈 템플릿 |

## 실행 방법

```sh
pnpm install      # 의존성 설치
pnpm dev          # 로컬 개발 서버
pnpm build        # 프로덕션 빌드
pnpm test:unit   # 단위 테스트
```

전체 게이트(`lint`·`typecheck`·`check:architecture`·`test:unit`·`test:integration`·`test:bdd`·`build`)는 PR의 CI에서 fail-closed로 실행된다. 상세는 `AGENTS.md`의 TDD/BDD 규칙을 본다.

## 이슈·PR 흐름

1. 이슈는 `.github/ISSUE_TEMPLATE/` 양식(작업/버그)으로 만든다.
2. 라벨은 `focus`/`instant`/`tuck` 중 하나, Milestone은 반드시 연결한다(생성은 사용자 수동).
3. 기능 브랜치는 `dev`에서 분기해 `dev`로 PR한다(squash merge).
4. `main`은 `dev` → `main` PR(merge commit)로만 반영하며 직접 push 금지.
5. PR 본문은 `.github/pull_request_template.md` 항목(테스트 증거·배포 URL·SHA·blocker)을 채운다.

## 배포·wiki

- 배포: Cloudflare Workers(단일 Worker가 SPA + API 서빙).
- wiki: https://github.com/usagi-ai-kr/moi/wiki — 릴리스 노트·운영 기록.
- 보안 신고·비밀값 취급은 `SECURITY.md`를 본다.
