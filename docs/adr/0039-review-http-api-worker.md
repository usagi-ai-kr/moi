---
id: ADR-0039
title: 복습 HTTP API와 Worker·D1 통합 계약
status: Accepted
date: 2026-10-19
related: ["#51", "#130", "#54", "ADR-0037", "ADR-0038"]
---

# ADR-0039: 복습 HTTP API와 Worker·D1 통합 계약

## 배경
- 복습 소스·북마크의 D1 저장과 필수 원자 채점 이후 브라우저 UI가 사용할 동일 출처 HTTP 경계가 필요하다.
- 후보·회차·버전 텍스트가 D1에서 일관되게 이어지고, 미채점 응답에서 정답·해설이 노출되지 않아야 한다.

## 결정
- Hono Worker에서 `GET /api/review/candidates`, `POST /api/review/sessions`, `GET /api/review/sessions/current`, `POST /api/review/sessions/current/answers`, `POST /api/review/sessions/current/end`, `GET /api/review/bookmarks`, `PATCH /api/review/bookmarks`를 제공한다.
- 인증된 userId는 `__Host-moi_session` 서버 세션에서만 얻는다. 요청의 userId를 권한 근거로 사용하지 않는다. 모든 응답은 `Cache-Control: no-store`; POST/PATCH는 logout과 동일한 교차 출처 차단을 적용한다.
- 응답 DTO는 허용 필드로 조립한다. 미채점 현재 문항과 후보는 답안·해설·근거를 제외하고, 채점 완료 문항의 채점 정보만 공개한다. 내부 복습 세션 ID와 userId는 복습 DTO에 싣지 않는다.
- 회차는 시작 당시 question/version/order 스냅샷을 유지한다. HTTP 조회·채점은 저장 question/version과 실제 활성 버전 매핑을 검증하고 불일치는 404로 응답한다. 채점은 app use case에서 D1 원자 commit으로 이어진다.
- 북마크 HTTP 변경은 명시 상태 PATCH로만 제공하며 같은 상태 반복은 멱등이다. 사용자가 시작한 회차의 후보 순서는 회차 중 변경하지 않는다.
- `review-api.test.ts`에서 Worker의 실제 `app.fetch`를 통해 20문제 세트 생성·답안 PATCH·제출·복습 후보·시작·채점·재개를 실행한다. 이 시나리오의 attempt는 사전 seed하지 않고 HTTP 제출에서 생성한다.

## 결과
- 긍정: UI는 동일 출처 요청·DTO 계약을 사용할 수 있고, Worker/D1 경로가 인증·user/exam 격리·저장·재개를 증명한다.
- 부정/제약: 이 ADR은 서버 API 범위다. 복습 UI·모바일 viewport·배포 및 실제 Kakao 계정 smoke는 별도 단위로 남는다. 이 서버 통합 증거만으로 #51 전체 완료를 선언하지 않는다.

## 대안과 금지 사항
- 브라우저에 저장된 userId/토큰을 권한 근거로 사용 — 금지한다.
- 후보/현재 문항 DTO에 answerOptionIds·explanation·sourceUrls를 항상 포함 — 금지한다.
- 토글형 HTTP 북마크로 조회 후 반대값을 저장 — 경합에 취약하므로 금지한다.

## 참고
- `src/infra/http/review/`, `src/infra/persistence/review-source-repository.ts`
- `tests/worker/review-api.test.ts`, `tests/worker/review-api-chunk.test.ts`, `review-api-contract.md`
