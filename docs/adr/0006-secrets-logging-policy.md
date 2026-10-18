---
id: ADR-0006
title: 비밀값·로그·개인정보 정책
status: Accepted
date: 2026-10-18
related: ["#2", "#4", "#11"]
---

# ADR-0006: 비밀값·로그·개인정보 정책

## 배경
- 인가 코드·토큰·세션·시크릿이 로그나 저장소에 남으면 2차 유출이 된다. 에이전트 작업과 CI 로그까지 노출면이 넓다.

## 결정
- 서버 비밀값(Kakao client secret, PASETO 키 등)은 Cloudflare Secrets로만 공급한다. 로컬은 `.dev.vars*`(gitignore)로 관리하고 예제만 커밋한다(`!.dev.vars.example`).
- 로그는 Pino 구조화 JSON + requestId 상관관계. Workers에서 `pino.transport()`/thread-stream을 쓰지 않는다.
- redaction 의무 대상: 토큰(JWT·PASETO), 쿠키, 인가 코드, state/nonce, client secret, Authorization 헤더. 검사 스크립트(`check-redaction.sh`)의 원문 출력·오류 해석 결함을 수정한 뒤 게이트에 연결한다(#11).
- 저장 금지: PASETO 원문(D1에는 jti 해시만), Kakao access/refresh token, 인가 코드.
- 개인정보 최소화: 로그의 `user_id`는 필요한 최소 범위, Kakao `sub`·이메일·닉네임 불필요 출력 금지. CI 로그에도 비밀값 금지.
- 브라우저에는 앱 토큰을 노출하지 않는다(localStorage/sessionStorage 금지). 인증 상태의 진실 원천은 서버 `/api/me`다.

## 결과
- 긍정: 유출면 축소, 사고 시 원문 없는 상관관계로 추적 가능.
- 부정/제약: 디버깅 시 토큰 원문을 볼 수 없어 fixture·재현 절차에 의존.

## 대안과 금지 사항
- 콘솔 로그 디버깅, 토큰 원문 저장, 시크릿의 `wrangler.toml` 커밋 — 금지.

## 참고
- 이슈 #2, #4, #11 / Pino transports 문서 / `kakao-oidc-auth`·`session-paseto` 스킬.
