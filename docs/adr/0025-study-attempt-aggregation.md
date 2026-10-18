---
id: ADR-0025
title: study_attempts attempt/firstAttempt D1 집계 저장 계약
status: Proposed
date: 2026-10-18
related: ["#54", "ADR-0024", "ADR-0021", "ADR-0020"]
---

# ADR-0025: study_attempts attempt/firstAttempt D1 집계 저장 계약

## 배경
- ADR-0024는 통계 **계산 파라미터**(분모·표본·반복 제한·첫 풀이 판정)만 고정했고, 그 입력이 될 attempt 데이터의 저장 계약은 남아 있었다(#54 잔여 공백).
- `study_sets`/`study_set_items`는 세트 스냅샷·채점 결과로, 반복 풀이·복습·정정 재계산을 행 단위로 표현하지 못한다.
- 파라미터가 정해져도 재계산 원천이 없으면 통계를 다시 만들 때 과거 이력을 복원할 수 없다.

## 결정
- **`study_attempts`(신규 D1 테이블)**: 일반 세트 제출과 오답/북마크 복습의 개별 채점 시도를 1행으로 저장한다. 최소 필드: `attemptId`(PK), `userId`, `examId`, `questionId`, `questionVersionId`, `outcome`(correct/wrong/pass/unanswered), `occurredAt`, `source`(set/review), `sourceId`, `excludedAt`(nullable), `firstAttempt`(boolean).
- **멱등**: `source + sourceId`(세트 제출·복습 채점 단위) 또는 `attemptId` UNIQUE로 중복 기록을 막는다. 일반 세트 제출과 복습 채점은 attempt 삽입이 성공해야 완료로 인정하는 트랜잭션 경계를 가진다(삽입 실패 → 제출/복습 실패).
- **firstAttempt 판정**: 해당 `userId/examId/questionId`의 **최초 채점 가능(correct/wrong) 시도만 true**. pass/unanswered는 firstAttempt와 진도에서 제외하며, 이후 첫 correct/wrong이 firstAttempt가 된다(ADR-0024 "첫 풀이" 정의와 동일).
- **정정 재계산**: 행 삭제 없이 `excludedAt` 설정(정정 이벤트)으로 제외하고, 재계산은 저장된 attempt에서 제외분을 걸러 수행한다. 최초/정정 결과 표시는 원본 attempt 결과와 정정 후 결과를 나란히 노출한다.
- **인덱스**: `(userId, examId, occurredAt)`, `(userId, examId, questionId)`, `(questionVersionId)`.
- **진실 원천 관계**: `study_sets`/`study_set_items`는 세트 스냅샷·채점 결과의 진실 원천으로 유지하고, attempt는 통계·복습용 **파생 이력**으로 둔다(원천 변경 없음).

## 결과
- 긍정: 반복·복습·정정을 행 단위로 표현, ADR-0024 파라미터로 결정적 재계산 가능, 시험·문제 버전 분리 집계.
- 부정/제약: 이중 기록(세트 결과 + attempt)에 따른 일관성 유지 부담, 정정 시 재계산 배치 필요, 구현 전 설계 단계라 스키마 확정은 후속 작업.

## 대안과 금지 사항
- **세트 결과 JSON만 집계** — 반복 풀이·복습 채점·정정 제외를 표현할 수 없어 기각.
- attempt 행 물리 삭제로 정정 — 감사·재현 불가라 금지(`excludedAt`만 허용).
- attempt를 진실 원천으로 격상, 파라미터 임의 변경 — 금지(ADR-0024 유지, 변경 시 새 ADR).

## 참고
- 이슈 #54, ADR-0024(계산 파라미터), ADR-0021(학습 현황), ADR-0020(학습·복습)
- 후속: `drizzle/**` 마이그레이션 추가, 세트 제출·복습 채점의 attempt 삽입·멱등 테스트, 정정 재계산 테스트(BDD)
