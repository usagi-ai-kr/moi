---
id: ADR-0003
title: Kakao OAuth2 Authorization Code + OIDC 인증
status: Accepted
date: 2026-10-18
related: ["#2", "#10", "#11"]
---

# ADR-0003: Kakao OAuth2 Authorization Code + OIDC 인증

## 배경
- 외부 인증은 Kakao 단일 공급자다. Workers(stateless) 환경에서 코드 교환과 리플레이 차단을 안전하게 처리해야 한다.

## 결정
- 흐름: `GET /auth/kakao`가 인가 URL로 302 → `GET /auth/kakao/callback`에서 서버 간 code 교환 → ID token 검증 → 검증된 `(provider='kakao', sub)` 반환.
- 트랜잭션 상태는 D1 `oauth_states`로 관리한다: `state_hash`(유일)·`browser_binding_hash`·`nonce`·`pkce_verifier`·`created_at`·`expires_at`·`consumed_at`. TTL 기본 10분.
- 로그인 시작 시 브라우저 한정 임시 쿠키(Secure/HttpOnly/SameSite=Lax)를 발급해 state와 바인딩하고, 콜백에서 일치를 검증한다 — 다른 브라우저에서 탈취한 state/code 재사용을 거부한다.
- `UPDATE … WHERE consumed_at IS NULL AND expires_at > now … RETURNING`(동등한 조건부 단일 변경)로 1회만 소비한다. 성공적으로 인증되지 않은 콜백에도 재사용 가능 상태를 남기지 않는다(fail-closed).
- PKCE S256 필수: `pkce_verifier`는 서버가 보관하고, 인가 요청 `code_challenge`와 토큰 교환 verifier를 일치 검증한다.
- ID token 검증: issuer `https://kauth.kakao.com` 고정, alg `RS256` 허용, `aud`=Kakao REST API key, `exp`/`iat`/`nonce`/비어 있지 않은 `sub` 검증, JWKS(사전 허용 URI) `kid` 캐시 미스 시 1회 재조회, 시계 오차 ±60초.
- 실패/취소/공급자 장애는 공통 실패 화면으로 수렴하고 내부 오류 코드만 로그에 남긴다(원문 금지, ADR-0006).

## 결과
- 긍정: state 리플레이·CSRF·코드 탈취 재사용을 구조적으로 차단, CI는 fake OIDC로 재현 가능.
- 부정/제약: D1 의존이 `oauth_states` 선행 migration으로 앞당겨짐. 브라우저 쿠키 전제(인앱 브라우저 등) 엣지 케이스 확인 필요.

## 대안과 금지 사항
- 서명 쿠키에 state/nonce만 담는 방식 — 리플레이 차단이 약해 채택하지 않는다.
- state 일치만으로 로그인 완료, 클라이언트 측 code 교환, 카카오 access token 저장 — 금지.
- 카카오 ID token(JWT)을 앱 세션으로 재사용하거나 클라이언트로 전달 — 금지(앱 세션은 ADR-0005).

## 참고
- 이슈 #2, #11 / Kakao Developers 문서 / `kakao-oidc-auth` 스킬.
