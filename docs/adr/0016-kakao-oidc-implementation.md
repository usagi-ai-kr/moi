---
id: ADR-0016
title: Kakao OIDC 구현 — 상태 소비·JWKS 검증·응답/로그 계약
status: Accepted
date: 2026-10-18
related: ["#2", "ADR-0003", "ADR-0006"]
---

# ADR-0016: Kakao OIDC 구현 — 상태 소비·JWKS 검증·응답/로그 계약

## 배경
- ADR-0003의 흐름을 Workers/Hono로 구현하며 세부 계약(소비 순서·검증 파라미터·응답·로그)을 확정해야 한다.

## 결정
- **state 선소비(fail-closed)**: callback은 쿠키·오류 파라미터 확인 전에 `state_hash` 기준 조건부 단일 UPDATE(`consumed_at IS NULL AND expires_at > now`) + `RETURNING`으로 먼저 소비한다. 취소·바인딩 불일치·검증 실패도 소비 상태를 만들어 성공 경로 재사용을 막는다.
- **쿠키/해시**: 브라우저 한정 임시 쿠키 `__Host-moi_oauth`(Secure·HttpOnly·SameSite=Lax·Path=/·Domain 없음·Max-Age=600) 원문값과 D1 `browser_binding_hash`(SHA-256 hex)를 비교한다. state 원문은 저장하지 않고 `state_hash` PK만 저장, TTL 600초.
- **PKCE**: verifier(64B→86자 base64url)는 서버 보관, 인가 요청에 S256 challenge만 노출.
- **OIDC 검증**: jose `createRemoteJWKSet`(고정 URL), RS256만 허용, issuer `https://kauth.kakao.com`, aud=KAKAO_CLIENT_ID, clockTolerance 60초. JWKS 저장소는 isolate 내 공유하고, kid 캐시 미스 시 `cooldownDuration` 30초 경과 후 검증 1회당 최대 1회 재조회한다(무제한 재조회·공급자 DoS 차단, 키 회전은 30초 내 반영). jose가 검증하지 않는 iat 미래(±60초 초과)·nonce 일치·비어 있지 않은 sub는 별도 검증. 검증 실패는 성공/400/502 어떤 경로로도 sub·토큰을 반환하지 않는다.
- **응답**: 성공 200 HTML, 실패 400(잘못된 state/바인딩/취소) 또는 502(upstream/토큰교환/JWKS/D1 장애), 모두 `Cache-Control: no-store`, 내부 오류 코드 미노출. **콜백 모든 응답(성공 포함)은 임시 쿠키를 `Max-Age=0`으로 삭제한다** — 로그인 시도 후 브라우저에 잔존하지 않는다.
- **로깅**: pino 대신 경량 JSON 어댑터(`infra/logging`) 채택 — 화이트리스트(level/msg/requestId/outcome) 외 필드를 전달할 방법이 없어 ADR-0006 계약을 구조적으로 강제한다. pino는 redact가 제거 방식이라 화이트리스트 강제가 어긋나고 `pino.transport()`는 Workers 금지다. `app`은 `AuthEventLogger` Port만 안다.
- **Port/Adapter**: `app/auth`에 `OAuthStateRepository`·`KakaoTokenClient`·`OidcVerifier`·`OAuthCrypto` Port와 `StartKakaoLogin`/`CompleteKakaoLogin` use case, `infra/auth/kakao`에서 WebCrypto·D1(drizzle)·fetch+jose로 구현.

## 결과
- 긍정: 동시 콜백 경합에서 한 요청만 승리, 리플레이/취소 재사용 차단, 로그 원문 유입 경로 부재.
- 부정/제약: nonce·verifier 원문을 TTL 동안 D1에 보관(해시 불가 항목), 실패 사유 상세는 로그로 유추만 가능.

## 참고
- 이슈 #2 / `kakao-oidc-auth` 스킬 / 테스트: `tests/unit/auth/**`, `tests/worker/auth-kakao.test.ts`.
