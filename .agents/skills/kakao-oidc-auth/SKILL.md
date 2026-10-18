---
name: kakao-oidc-auth
description: Kakao Authorization Code + OIDC 로그인 구현·수정 지침. /auth/kakao authorize 리다이렉트, callback code 교환, ID token JWKS·iss·aud·exp·nonce·alg·kid 검증, state 일회성·만료 처리, 실패 화면, fake OIDC 테스트가 필요할 때 사용.
compatibility: sh와 grep 필요 (scripts/check-redaction.sh).
---

# Kakao OAuth2/OIDC 인증 교환 및 토큰 검증

출처: 이슈 #2. 선행: #1(아키텍처·테스트 파이프라인 완료). PASETO 세션 발급은 #4의 책임이며 여기서 하지 않는다.

## 스크립트 (우선 실행 — repo root에서 실행)
- `sh .agents/skills/kakao-oidc-auth/scripts/check-redaction.sh <logfile ...>` — 로그/텍스트에서 PASETO·JWT·인가 코드·시크릿 패턴을 탐지한다(인자 없으면 stdin). 검출 시 exit 1.

## 전제
- Kakao Developers: 카카오 로그인/OIDC ON, 허용 Redirect URI 등록(정확히 일치).
- 비밀값(client secret 등)은 Cloudflare Secrets에만 등록. 코드/이슈/CI 로그 노출 금지.
- 카카오 이메일/닉네임 동의를 사용자 식별의 필수 조건으로 만들지 않는다.

## 구현 절차
1. `GET /auth/kakao` (infra/http)
   - 서버에서 고유 `state` + `nonce` 생성, 만료·일회성 검증 가능한 트랜잭션 상태 관리.
   - 카카오 인가 URL로 302.
2. `GET /auth/kakao/callback` (infra/http)
   - `code`/`error`/`state` 수신 → state 검증(만료·재사용 거부) → **서버 간** token endpoint 교환.
   - Zod로 callback 쿼리, token 응답, userinfo JSON, OIDC 필수 필드 검증.
3. ID token 검증 (infra/auth/kakao)
   - Kakao JWKS로 서명 검증, `iss`/`aud`/`exp`/`nonce` + `alg`/`kid` 검사, `sub` 추출.
   - 검증 결과 반환: `provider='kakao'`, `sub`. 영속 저장은 #3의 책임.
4. Port/Adapter
   - Kakao API 클라이언트, OIDC 검증기는 app Port로 추상화하고 infra에서 구현.
   - 외부 endpoint 호출은 서버 측 fetch 또는 Ky로 표준화하되, **브라우저 Ky 앱 클라이언트와 혼동 금지**.

## 거부 규칙 (모두 테스트 필수)
- 잘못된/만료/재사용된 state → 인증 거부.
- nonce 불일치, issuer/audience 불일치, 서명 실패, 만료 토큰 → 거부.
- 잘못된 Zod payload, upstream timeout, 잘못된 JWKS 응답 → 안전한 실패 처리.

## 금지 사항
- Kakao 토큰을 SPA localStorage/sessionStorage에 저장 금지.
- code/state/nonce/토큰/시크릿 로그 출력 금지 (Pino requestId 상관관계 로그만).
- #2에서 PASETO 발급 금지(→ #4). Kakao ID token을 앱 세션으로 재사용하거나 클라이언트로 전달 금지.

## 테스트 (RED → GREEN → REFACTOR)
- Vitest: fake OIDC/JWKS 단위 테스트(state/nonce/iss/aud/exp/서명/만료 케이스).
- Worker HTTP 통합 테스트: 정상 콜백, 오류 콜백(취소), upstream 장애.
- redaction 검증: 로그에 code/state/nonce/토큰이 없음.
- CI는 실제 Kakao 계정을 사용하지 않는다. 실계정 smoke는 배포 환경에서(#5).

## BDD 시나리오 골격
- Given 올바른 code/state/서명된 ID token When callback Then 검증된 provider='kakao' sub를 얻는다.
- Given 잘못된/만료/재사용된 state When callback Then 인증을 거부한다.
- Given nonce/iss/aud 불일치 또는 서명 실패/만료 When 검증 Then 거부한다.
- Given 사용자 동의 취소/카카오 장애 When callback Then 안전한 실패 화면으로 이동한다.

## 레퍼런스
- https://developers.kakao.com/docs/ko/kakaologin/utilize
- https://developers.kakao.com/docs/ko/kakaologin/rest-api
