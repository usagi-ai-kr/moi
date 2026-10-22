---
id: ADR-0041
title: 복습 회차 종료 cursor CAS와 stale 답안 경합
status: Accepted
date: 2026-10-19
related: ["#51", "#130", "ADR-0027", "ADR-0028"]
---

# ADR-0041: 복습 회차 종료 cursor CAS와 stale 답안 경합

## 배경
- 종료 use case가 활성 회차를 읽고 만든 snapshot을 조건 없는 `save`로 저장해, 그 사이 완료된 답안의 cursor/items를 되돌릴 수 있었다.
- 답안 HTTP route가 읽은 cursor와 use case가 다시 읽은 cursor가 다르면, 성공한 답안과 다른 회차 항목의 정답·해설을 응답할 수 있었다.

## 결정
- 종료 전용 `ReviewSessionRepository.end({ session, expectedCursor })`를 추가한다. D1 UPDATE는 회차 id·user·exam·mode·active 상태·expectedCursor가 모두 일치할 때만 종료하고, 0행이면 경합 실패로 반환한다. 종료는 attempt를 생성하지 않는다.
- 같은 ended snapshot 재요청은 기존처럼 저장소에서 멱등 성공으로 취급한다. app의 활성 회차 재종료 응답은 기존 not-found 정책을 유지한다.
- 답안 route는 최초 읽은 cursor를 use case에 전달한다. 두 번째 조회에서 회차가 없어졌거나 cursor가 달라지면 conflict로 거부하고 HTTP 409를 반환한다.
- 성공 feedback은 commit 결과의 attempt questionId와 questionVersionId에 일치하는 graded 항목의 내용만 사용한다. 미채점 항목은 정답·해설을 제공하지 않는다.

## 결과
- 긍정: 답안 선행 시 오래된 종료가 cursor/items를 덮지 않고 409가 된다. 최신 cursor 재조회 후 종료할 수 있고 기존 attempt가 보존된다. 종료 선행 시 오래된 답안은 409이며 attempt가 없다.
- 부정/제약: stale snapshot 요청은 자동 재기반하지 않으므로 클라이언트가 최신 회차를 조회하고 재시도해야 한다. D1 CAS는 로컬 Worker D1 통합 테스트로 검증하며 원격 DB 검증 범위는 아니다.

## 대안과 금지 사항
- 종료 시 generic `save` 사용, HTTP route의 stale cursor를 use case가 무시, 현재 cursor의 답안 결과를 최초 snapshot 인덱스에 연결하는 방식은 금지한다.

## 참고
- #51, PR #130. 실제 Worker D1 검증: `tests/worker/review-grading-repository.test.ts`, `tests/worker/review-session-repository.test.ts`, `tests/worker/review-api.test.ts`.
