---
id: ADR-0058
title: 복습 시험 식별자 공개 코드 정규화와 내부 ID 읽기 호환
status: Accepted
date: 2026-10-21
related: ["#51", "#54", "ADR-0020", "ADR-0039", "ADR-0040"]
---

# ADR-0058: 복습 시험 식별자 공개 코드 정규화와 내부 ID 읽기 호환

## 배경
- 운영 D1의 `study_attempts.exam_id`는 공개 코드(`saa-c03`)로 저장된다(UI가 코드로 학습 세트를 시작). ADR-0040은 복습도 내부 ID(`exam-saa-c03`) 축으로 저장·집계하도록 정해 실제 저장 축과 어긋났다.
- 그 결과 복습 후보 조회가 0건이 되어 "오답 다시 풀기"가 422 `no_candidates`로 실패했다(회차 자체가 시작되지 않음). 테스트는 내부 ID로 시드해 불일치를 놓쳤다.
- 사용자 제보: "오답 다시 풀기가 안 됨, 오답 10개 이하여도 작동해야".

## 결정
- 시험 ID를 저장하는 축은 공개 코드로 통일한다. 복습 HTTP 라우트(candidate/session/answer/end·bookmark)는 `exams.code`를 use case `examId`로 넘겨 `review_sessions.exam_id`와 복습 attempt의 `study_attempts.exam_id`가 학습 세트와 같은 코드 축에 놓인다(ADR-0040 대체).
- 읽기는 양방향 호환한다. `listWrongCandidates`는 문제 조회만 내부 ID로 하고, 시도 조회는 같은 시험의 입력값·`exams.id`·`exams.code`를 `IN`으로 함께 조회한다. 과거 내부 ID로 저장된 시도도, 신규 코드 시도도 후보가 된다.
- 후보 하한은 `REVIEW_MIN_CANDIDATES=1`을 유지한다. 1~10개도 정상 시작하고 0개만 422 `no_candidates`다.
- 요청 `examId`는 ID·code 모두 허용하고 응답 DTO의 `examId`는 계속 공개 코드를 반환한다(ADR-0040 유지 부분).
- 스키마에 FK가 없고 기존 복습 데이터가 0건이므로 데이터 마이그레이션은 하지 않는다.

## 결과
- 긍정: 복습 후보·회차·시도·통계가 같은 시험 축에 놓여 오답 재풀이가 동작하고, 복습에서 정답 처리한 문제가 후보에서 빠진다.
- 부정/제약: `review_sessions`의 활성 회차 조회는 입력값 그대로의 축이라, 과거 내부 ID로 저장된 회차는 발견되지 않는다(운영 0건이라 영향 없음). 복습 시도가 학습 세트의 `first_attempt` 기준에 포함된다(#54 통계 축 일치).

## 대안과 금지 사항
- 내부 ID로 되돌리기 — 학습 세트 축(코드)과 어긋나 재발한다. 금지한다.
- 후보 조회를 내부 ID로만 제한 — 과거 내부 ID 시도만 읽어 신규 코드 시도를 놓친다. 금지한다.
- `IN`에 다른 시험의 식별자를 넣기 — 시험 격리가 깨진다. 같은 시험의 id·code만 허용한다.
- 데이터 마이그레이션 — 스키마 변경이 없고 기존 복습 데이터가 없다. 금지한다.

## 참고
- src/infra/http/review/*.ts, src/infra/persistence/review-source-repository.ts
- tests/worker/review-exam-id-code.test.ts, tests/worker/review-api.test.ts
