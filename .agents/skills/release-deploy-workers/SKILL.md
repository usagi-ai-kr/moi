---
name: release-deploy-workers
description: Cloudflare Workers 배포·검증 지침. 단일 Worker(SPA+Hono) 배포, D1 원격 마이그레이션, Secrets 바인딩, Kakao Redirect URI 등록, viewport 스크린샷, 실계정 smoke(최초/재로그인/로그아웃), 배포 보고 형식이 필요할 때 사용.
compatibility: curl 필요 (scripts/smoke-check.sh).
---

# Workers 배포와 실서비스 smoke 검증

출처: 이슈 #5(선행 #4). 관련: `tdd-bdd-testing`, `session-paseto`.

## 스크립트 (우선 실행 — repo root에서 실행)
- `sh .agents/skills/release-deploy-workers/scripts/smoke-check.sh <base-url>` — 배포 기본 smoke: `/` 200, `/api/me` 401, `Cache-Control: no-store` 확인. 실패 사유만 간결 출력.

## 배포 전 체크리스트
- [ ] 동일 Worker 배포 단위에서 SPA 정적 자산 + Hono API 서빙 확인
- [ ] production custom domain 또는 workers.dev endpoint 확인
- [ ] D1 원격 마이그레이션 적용
- [ ] Cloudflare Secrets 바인딩(PASETO 대칭 키, Kakao client secret 등)
- [ ] Kakao Developers Redirect URI 정확히 등록
- [ ] `paseto-ts` Workers 번들 호환 검증
- [ ] Pino 구조화 로그(thread transport 미사용) 검증
- [ ] CI 게이트 전체 통과: lint / typecheck / check:architecture / test:unit / test:integration / test:bdd / build

## 자동 검증 (CI/BDD)
- [ ] playwright-bdd feature files & steps로 0.x 시나리오 실행
- [ ] viewport 320/375/768/1024/1280 로그인·오류·로그아웃 스크린샷 + 가로 오버플로 검증
- [ ] state/nonce 재사용, 만료/위조 ID token, 무권한 접근, 쿠키 속성, 로그 secret 노출 여부 검증
- [ ] PASETO 생성/검증/변조/만료/폐기/키 교체 — Workers 실런타임 통합 테스트
- [ ] Ky timeout/401, TanStack Query 재검증/캐시 삭제, Zustand UI-only 책임, Zod 4xx/5xx 분류, Drizzle migration 테스트
- [ ] 브라우저에 앱 JWT/접근 토큰이 저장되지 않고, PASETO는 HttpOnly 쿠키에만 있음 확인

## 실계정 smoke (배포 환경, 수동)
- [ ] 최초 로그인 / 재로그인 시 user_id 유지
- [ ] 서로 다른 두 Kakao 계정 → 서로 다른 user_id로 식별
- [ ] 로그아웃 → 이후 보호 API 미인증 응답 + 발급된 PASETO 재사용 거부
- [ ] 실패/취소 플로

## 보고 형식 (PR/이슈에 기록)
- 배포 URL, commit SHA, DB migration 내역, 테스트 명령/결과, 미해결 blocker
- 완료 후 다음 신규 기능 단위는 `1.0.0`으로 기획한다(프로젝트 내부 버전 규칙).
- Milestone은 사용자가 수동 생성한다(에이전트는 명시 요청 시에만). 우선순위 근거: Milestone `0.1.0`~`0.1.4`와 이슈 본문 버전·선행 링크. → `issue-triage`
