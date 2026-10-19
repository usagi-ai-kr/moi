---
id: ADR-0038
title: 복습 원자 채점 0행 보상과 세트·복습 firstAttempt 경합
status: Accepted
date: 2026-10-19
related: ["#54", "#51", "ADR-0025", "ADR-0028"]
---

# ADR-0038: 복습 원자 채점 0행 보상과 세트·복습 firstAttempt 경합

## 배경
- ADR-0028의 UPDATE-first + `changes()` 가드는 UPDATE가 0행인 경우만 막는다. `study_attempts BEFORE INSERT RAISE(IGNORE)`이면 INSERT가 0행이어도 앞선 회차 UPDATE가 남는다.
- set 제출 어댑터가 app에서 계산한 `firstAttempt`를 그대로 저장하면 review SQL과의 동시 제출에서 두 attempt가 모두 최초로 기록될 수 있다.
- review/review 경합만으로는 `StudySetRepository.submit()`와 review `commit()`의 실제 교차 경로를 검증하지 못한다.

## 결정
- 복습 commit은 D1 batch에서 조건부 attempt INSERT → INSERT `changes() = 1`일 때만 cursor/items UPDATE → UPDATE `changes() = 0`일 때 후보 attempt DELETE 순서로 실행한다.
- attempt INSERT는 active 세션의 user/exam/mode/cursor 및 저장된 현재 question/version/pending 상태를 확인한다. UPDATE도 같은 CAS와 스냅샷 조건을 확인한다.
- 성공은 INSERT 1행·UPDATE 1행·cleanup DELETE 0행일 때만 반환한다. INSERT가 0행이면 UPDATE를 막고, UPDATE가 0행이면 같은 batch에서 삽입 후보를 삭제해 false·쓰기 0건으로 끝낸다. UNIQUE/FK 등 SQL 예외는 D1 batch 전체 롤백 대상이다.
- 세트 제출과 복습 채점의 `first_attempt`는 각 D1 INSERT 문에서 산정한다. 같은 user/exam/question의 제외되지 않은 correct/wrong 이력이 없을 때만 correct/wrong을 1로 저장하고, pass/unanswered와 제외된 새 attempt는 0으로 둔다. app이 전달한 boolean은 저장 시 진실 원천으로 사용하지 않는다.
- Worker/D1에서 INSERT 무시 0행, UPDATE 무시 0행, 실제 세트 `submit()` 대 복습 `commit()` 동시 실행을 검증한다.

## 결과
- 긍정: INSERT·UPDATE 어느 쪽이 0행이어도 false와 쓰기 0건을 보장하고, set/review 교차 경합에서 유효 최초 시도는 하나만 true다.
- 부정/제약: D1 batch가 순차 실행하는 SQL의 changes() 동작과 cleanup 조건에 의존한다. cleanup 조건은 회차 CAS와 해당 attempt의 source/id를 함께 묶는다.

## 대안과 금지 사항
- UPDATE-first 후 INSERT만 가드 — INSERT의 무시 0행에서 회차가 진행되는 반례가 있어 기각한다.
- app의 prior-history 조회 결과만으로 set firstAttempt 저장 — 조회와 저장 사이 set/review 경합이 가능해 진실 원천으로 금지한다.
- 두 번째 batch에서 실패를 보상 — 부분 상태가 외부에 보이는 간격이 생겨 금지한다.

## 참고
- `src/infra/persistence/review-grading-repository.ts`, `src/infra/persistence/study-repository.ts`
- `tests/worker/review-grading-repository.test.ts`, `tests/worker/study-submit-attempts.test.ts`
