---
name: session-paseto
description: PASETO v4.local 기반 앱 세션 구현·검증 지침. 세션 발급/검증/폐기, D1 jti 해시 메타데이터, __Host- 쿠키 속성, GET /api/me, POST /auth/logout CSRF, 키 관리·회전, 위조·만료·폐기 테스트가 필요할 때 사용.
compatibility: openssl(키), wrangler(시크릿), curl(쿠키 검증) 필요.
---

# PASETO v4.local 세션 — 발급·검증·폐기

출처: 이슈 #1(추가 결정), #4, ADR-0005. **자체 JWT 발급, DB 랜덤 opaque session ID, JWT fallback 도입은 모두 금지.**

## 스크립트 (우선 실행 — repo root에서 실행)
- `sh .agents/skills/session-paseto/scripts/put-paseto-key.sh <SECRET_NAME> [--local | --env <name>] [--replace]` — 32바이트 키를 생성해 Secrets(.dev.vars)에 등록한다. `.dev.vars` gitignore 확인·중복 키 기본 거부·umask 077, 키 원문은 출력하지 않는다.
- `sh .agents/skills/session-paseto/scripts/check-cookie.sh <url>` 또는 `--headers-file <file>` — 대상 쿠키(기본 `__Host-moi_session`)의 Set-Cookie를 **헤더 단위로** 검증한다(Secure/HttpOnly/SameSite=Lax/Path=//Domain 부재/Max-Age). 쿠키 값 원문은 출력하지 않는다.
- `sh .agents/skills/session-paseto/scripts/check-cookie.test.sh` · `put-paseto-key.test.sh` — 검사·키 스크립트 가드 회귀 테스트.

## 토큰 규격
- `v4.local` 암호화 토큰. 필수 payload: `sub`(앱 내부 UUID — Kakao sub 아님), `jti`(고유 식별자), `iat`, `exp`. 필요 시 `kid`/footer.
- 발급 시 무작위 `jti` 포함. 복호화 후 타입/만료/허용 키/클레임을 Zod·명시적 검증으로 확인.
- 수명: 절대 만료 24시간, 슬라이딩 갱신 없음. 로그인/재로그인마다 새 `jti`·새 토큰(ADR-0005). 변경은 ADR로 관리.
- 대칭 키는 Cloudflare Secrets로만 공급. 키 회전 시 이전 키의 유효 토큰 검증 → 만료 후 제거 정책 수립.
- 라이브러리 후보 `paseto-ts`(v4.local). Workers 런타임/번들 호환성 검증 후 lockfile에 버전 고정. 호환성 실패 시 같은 PASETO 규격의 다른 구현체로 교체(JWT/opaque session 폴백 금지).

## 쿠키 규칙
- `__Host-` 접두사 + `Secure` + `HttpOnly` + `SameSite=Lax` + `Path=/` + Domain 미지정.
- 로그인 성공 시 **새 세션 발급**(세션 고정 공격 방지). 실서비스에서 Secure 해제 금지.
- 로그아웃/삭제 응답은 `Max-Age=0`으로 설정한다(검사 스크립트가 삭제로 인식).
- 로컬 개발의 Secure 쿠키 동작은 실제 Workers 런타임에서 별도 검증.

## D1 세션 메타데이터
- `sessions`: `user_id` FK, `jti_hash`(원문 PASETO 저장 금지), `issued_at`, `expires_at`, `revoked_at` 등.
- D1은 PASETO를 대체하는 세션 토큰 저장소가 아니라 **발급/폐기 기록** 관리용이다.
- 각 보호 요청에서 PASETO 유효성 + `jti` 활성 여부를 검사. 로그아웃/강제 폐기는 즉시 적용.

## API 동작
- `GET /api/me`: 미로그인 401, 로그인 시 최소 사용자 정보, `Cache-Control: no-store`. 변조/만료/폐기 토큰 401.
- `POST /auth/logout`: Origin + `Sec-Fetch-Site` 검증(실패 403) → 세션 revoke → Set-Cookie 삭제(`Max-Age=0`). 같은 PASETO 재사용 불가.
- 앞으로 도입되는 모든 사용자 소유 데이터 접근은 서버 검증 `user_id` 기준으로 scope 제한.

## 검증 순서 (미들웨어)
1. `__Host-` 쿠키 존재 확인 → 없으면 401
2. PASETO 복호화(허용 키) → 실패/변조 시 401
3. payload Zod·클레임(`sub`/`jti`/`iat`/`exp`) 검사
4. D1에서 `jti_hash` 활성 여부(`revoked_at`, `expires_at`) 확인
5. 통과 시 app usecase로 진행

## 테스트 목록
- [ ] 위조/변조 토큰 401
- [ ] 만료 토큰 401
- [ ] 다른 키로 만든 토큰 401
- [ ] 폐기된 `jti` 401
- [ ] 키 회전: 이전 키 유효 토큰 허용 → 만료 후 거부
- [ ] 로그아웃 후 동일 PASETO 재사용 401
- [ ] 새로고침 시 쿠키 유효 → TanStack Query가 서버로부터 사용자 상태 복원, Zustand/localStorage에 토큰 없음
- [ ] Ky가 401 수신 → UI가 서버 인증 상태 재검증, 민감정보 미기록
- [ ] 쿠키 속성(`__Host-`/Secure/HttpOnly/SameSite=Lax/Path=/) 자동 검증
- [ ] 미들웨어/로그에 PASETO 원문 없음
- [ ] 검사 스크립트 회귀 테스트 통과(`check-cookie.test.sh`, `put-paseto-key.test.sh`)

## 금지 사항
- 자체 JWT 발급, opaque session ID 대체, JWT fallback.
- PASETO 원문 DB 저장, 로그 출력, 브라우저 노출.

## 키 회전 절차 (ADR-0005)
1. 새 키 등록: `put-paseto-key.sh PASETO_KEY_V2 --replace`(로컬) / `--env <name>`(원격) — 허용 키 목록에 V1+V2 공존.
2. 신규 토큰은 V2로 발급, 서버는 V1·V2 모두 검증(미지의 kid/키 거부).
3. V1 토큰 최대 수명(24시간) 경과 후 V1 제거.

## 레퍼런스
- https://github.com/auth70/paseto-ts
- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
