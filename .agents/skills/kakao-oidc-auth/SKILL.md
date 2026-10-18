---
name: kakao-oidc-auth
description: Kakao Authorization Code + OIDC 로그인 구현·수정 지침. /auth/kakao authorize 리다이렉트, callback code 교환, ID token JWKS·iss·aud·exp·nonce·alg·kid 검증, state 일회성·만료·브라우저 바인딩, PKCE S256, 실패 화면, fake OIDC 테스트가 필요할 때 사용.
compatibility: sh와 grep 필요 (scripts/check-redaction.sh).
---

# Kakao OAuth2/OIDC 인증 교환 및 토큰 검증

출처: 이슈 #2, ADR-0003. 선행: #1(아키텍처·테스트 파이프라인 완료). PASETO 세션 발급은 #4의 책임이며 여기서 하지 않는다.

## 스크립트 (우선 실행 — repo root에서 실행)
- `sh .agents/skills/kakao-oidc-auth/scripts/check-redaction.sh <logfile ...>` — 로그/텍스트에서 PASETO·JWT·인가 코드·시크릿·쿠키/Authorization 패턴을 탐지한다(인자 없으면 stdin). 검출 시 `FAIL: <파일>:<라인>:<규칙ID>`만 출력하고 exit 1, 읽기/검사 오류는 exit 2. **원문(토큰·코드·시크릿)은 절대 출력하지 않는다.**
- `sh .agents/skills/kakao-oidc-auth/scripts/check-redaction.test.sh` — 위 검사 스크립트의 회귀 테스트(fixture).

## 전제
- Kakao Developers: 카카오 로그인/OIDC ON, 허용 Redirect URI 등록(정확히 일치).
- 비밀값(client secret 등)은 Cloudflare Secrets에만 등록. 코드/이슈/CI 로그 노출 금지.
- 카카오 이메일/닉네임 동의를 사용자 식별의 필수 조건으로 만들지 않는다.

## 구현 절차
1. `GET /auth/kakao` (infra/http)
   - 서버에서 고유 `state` + `nonce` + `pkce_verifier` 생성, 브라우저 한정 임시 쿠키(Secure/HttpOnly/SameSite=Lax) 발급.
   - D1 `oauth_states`(state_hash·browser_binding_hash·nonce·pkce_verifier·TTL 10분 기본)로 트랜잭션 상태 관리(소관 #2).
   - 카카오 인가 URL(`code_challenge` S256·`state`)로 302.
2. `GET /auth/kakao/callback` (infra/http)
   - `code`/`error`/`state` 수신 → state·브라우저 바인딩 검증 → `UPDATE … WHERE consumed_at IS NULL AND expires_at > now … RETURNING` 조건부 단일 변경으로 1회 소비(fail-closed) → **서버 간** token endpoint 교환(verifier 일치 검증).
   - Zod로 callback 쿼리, token 응답, userinfo JSON, OIDC 필수 필드 검증.
3. ID token 검증 (infra/auth/kakao)
   - Kakao JWKS로 서명 검증: issuer `https://kauth.kakao.com` 고정, `RS256` 허용, `aud`=REST API key, `exp`/`iat`/`nonce`/비어 있지 않은 `sub`, `kid` 캐시 미스 시 1회 재조회, 시계 오차 ±60초.
   - 검증 결과 반환: `provider='kakao'`, `sub`. 영속 저장은 #3의 책임.
4. Port/Adapter
   - Kakao API 클라이언트, OIDC 검증기는 app Port로 추상화하고 infra에서 구현.
   - 외부 endpoint 호출은 서버 측 fetch 또는 Ky로 표준화하되, **브라우저 Ky 앱 클라이언트와 혼동 금지**.

## 거부 규칙 (모두 테스트 필수)
- 잘못된/만료/재사용된 state → 인증 거부.
- 타 브라우저 바인딩 불일치, PKCE verifier 불일치 → 거부.
- nonce 불일치, issuer/audience 불일치, 서명 실패, 만료 토큰 → 거부.
- 잘못된 Zod payload, upstream timeout, 잘못된 JWKS 응답 → 안전한 실패 처리.

## 금지 사항
- Kakao 토큰을 SPA localStorage/sessionStorage에 저장 금지.
- code/state/nonce/토큰/시크릿 로그 출력 금지 (Pino requestId 상관관계 로그만).
- #2에서 PASETO 발급 금지(→ #4). Kakao ID token을 앱 세션으로 재사용하거나 클라이언트로 전달 금지.

## 테스트 (RED → GREEN → REFACTOR)
- Vitest: fake OIDC/JWKS 단위 테스트(state/nonce/iss/aud/exp/서명/만료 케이스).
- Worker HTTP 통합 테스트: 정상 콜백, 오류 콜백(취소), upstream 장애.
- redaction 검증: 로그에 code/state/nonce/토큰이 없음. 검사 스크립트 자체 회귀 테스트(`check-redaction.test.sh`)로 검출 시 원문 미출력·오류 exit 2를 검증.
- CI는 실제 Kakao 계정을 사용하지 않는다. 실계정 smoke는 배포 환경에서(#5).

## BDD 시나리오 골격
- Given 올바른 code/state/서명된 ID token When callback Then 검증된 provider='kakao' sub를 얻는다.
- Given 잘못된/만료/재사용된 state When callback Then 인증을 거부한다.
- Given nonce/iss/aud 불일치 또는 서명 실패/만료 When 검증 Then 거부한다.
- Given 사용자 동의 취소/카카오 장애 When callback Then 안전한 실패 화면으로 이동한다.

## 레퍼런스
- https://developers.kakao.com/docs/ko/kakaologin/utilize
- https://developers.kakao.com/docs/ko/kakaologin/rest-api
