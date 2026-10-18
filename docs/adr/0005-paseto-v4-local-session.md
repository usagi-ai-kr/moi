---
id: ADR-0005
title: 앱 세션 PASETO v4.local
status: Accepted
date: 2026-10-18
related: ["#1", "#4", "#11"]
---

# ADR-0005: 앱 세션 PASETO v4.local

## 배경
- 초기 opaque session token 설계를 대체하는 서버 세션 증명이 필요하다. 브라우저 JS에서 접근 가능한 형태로 토큰 원문을 두지 않는다.

## 결정
- 앱 자체 인증 토큰은 **PASETO v4.local**만 발급한다. 자체 JWT 발급, DB 랜덤 opaque session ID 대체, JWT 폴백을 금지한다. 라이브러리 후보는 `paseto-ts`(v4.local)이며 Workers 번들·WebCrypto 호환 스파이크(#1) 후 lockfile에 고정한다. 호환 실패 시 같은 PASETO 규격의 다른 구현체로 교체한다.
- payload: `sub`(앱 내부 UUID), `jti`(고엔트로피 난수), `iat`, `exp`. 키 식별자(kid/footer)는 허용 목록만 선택하고 미지의 값은 거부한다.
- 수명: 절대 만료 24시간, 슬라이딩 갱신 없음. 로그인·재로그인마다 새 `jti`·새 토큰을 발급한다. 변경은 ADR로 관리한다.
- D1 `sessions(jti_hash PRIMARY KEY, user_id FK, issued_at, expires_at, revoked_at)`: PASETO 원문은 저장하지 않고 jti 해시만 보관한다. 모든 보호 요청에서 복호화·클레임 검증 후 jti 활성 여부를 검사하며, 로그아웃·강제 폐기는 즉시 적용된다.
- 쿠키: `__Host-moi_session` 단일 쿠키에 Secure/HttpOnly/SameSite=Lax/Path=/, Domain 미지정, Max-Age=만료 차이. HTTPS 운영에서 Secure 해제 금지.
- API: `GET /api/me`는 200 `{id}` 또는 401 + `Cache-Control: no-store`. `POST /auth/logout`은 Origin·Sec-Fetch-Site 검증(실패 403) → D1 revoke → Set-Cookie 삭제. 미인증·변조·만료·폐기 PASETO는 401.
- 키는 Cloudflare Secrets로만 공급한다. 회전 시 이전 키의 유효 토큰 검증 → 만료 후 제거 정책을 수립한다.

## 결과
- 긍정: 브라우저 노출 경로 제거(XSS로도 토큰 탈취 불가), 서버 측 즉시 폐기, 규격 기반 검증.
- 부정/제약: 보호 요청마다 D1 조회 1회 추가(초기 수용, 후속 최적화 여지). Workers 번들 호환을 구현 전에 확인해야 한다.

## 대안과 금지 사항
- 자체 JWT, opaque session token, 브라우저 저장소 토큰 — 금지. PASETO 원문 저장·로그·노출 — 금지.

## 참고
- 이슈 #1, #4, #11 / `session-paseto` 스킬 / auth70/paseto-ts.
