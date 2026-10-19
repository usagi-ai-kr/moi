---
id: ADR-0028
title: 복습 회차 진행과 시도 기록 원자 저장
status: Proposed
date: 2026-10-19
related: ["#54", "#51", "ADR-0020", "ADR-0025", "ADR-0027"]
---

# ADR-0028: 복습 회차 진행과 시도 기록 원자 저장

## 배경
- 채점은 app에서 되지만 회차 갱신과 attempt 기록이 분리돼 둘 중 하나만 남을 수 있다.
- stale 답안·종료·타인 소유·경합·잘못된 문제 저장을 SQL로 거부해야 한다.

## 결정
- Port `ReviewGradingRepository.commit({session, expectedCursor, attempt})` — session은 채점 후 스냅샷(cursor=expected+1).
- Port attempt에 source/sourceId 없음 — 어댑터가 `source='review'`, `sourceId=session.id`로 고정해 타 세션 혼입을 막는다.
- insert-first CAS batch: attempt INSERT(SELECT+EXISTS 구 cursor) → 회차 UPDATE(CAS), WHERE에 id/user/exam/mode/active/cursor + 저장 items[expected] questionId/versionId(json_extract).
- `ON CONFLICT DO NOTHING` 금지 — UNIQUE 위반은 false·롤백으로 알린다.
- firstAttempt는 트랜잭션 내 SQL 산정(같은 user/exam/question 유효 최초만 true, pass false), occurredAt(ms) 보존.

## 결과
- 긍정: 성공 시 cursor/items+attempt 1행, stale·종료·소유권·문제/개정 바꿔치기는 false·0건, 경합 1승·attempt 1건 실 D1 증명.
- 부정/제약: UPDATE ABORT trigger로 insert-first 롤백 증명됨(테스트 통과), 0행 no-op와 예외 롤백은 구분한다. bootstrap 미연결.

## 대안과 금지 사항
- 정규화·별도 트랜잭션·DO NOTHING 성공 위장 — 기각·금지. 엉뚱한 question·버전·outcome 저장 금지.

## 참고
- #54/#51, ADR-0020/0025/0027. 검증: `tests/worker/review-grading-repository.test.ts`.
