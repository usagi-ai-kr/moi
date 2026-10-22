---
id: ADR-0040
title: 복습 API 시험 식별자 내부 ID 정규화
status: Superseded by ADR-0058
date: 2026-10-19
related: ["#51", "#54", "#130", "ADR-0019", "ADR-0039", "ADR-0058"]
---

# ADR-0040: 복습 API 시험 식별자 내부 ID 정규화

## 배경
- 복습 API는 시험 내부 ID와 공개 code를 모두 받지만, code 입력을 그대로 회차·채점 저장에 넘기면 학습 세트가 사용하는 exams.id와 저장 축이 갈라진다.
- 후보 D1 어댑터만 code를 내부 ID로 바꾸면 후보 집계는 맞아도 복습 회차와 attempt의 exam_id가 code로 저장될 수 있다. code와 ID로 같은 사용자·시험·모드를 요청하면 활성 회차가 중복 생성된다.

## 결정
- 각 복습 HTTP 요청 경계에서 시험 ID 또는 code를 D1의 {id, code}로 한 번 정규화한다. ID가 정확히 일치하면 ID를 우선하고, 그렇지 않으면 code를 조회한다.
- 복습 source·회차 repository·채점 use case에는 내부 exams.id만 전달한다. review_sessions.exam_id와 study_attempts.exam_id도 내부 ID로 저장·집계한다.
- 요청의 examId는 기존 UI 호출을 위해 ID 또는 code를 허용한다. 응답 DTO의 examId는 일관되게 공개 시험 code를 반환한다.
- 존재하지 않는 시험은 복습 API 전체에서 404 {error:'not_found'}로 응답한다. 해당 시험에 후보가 없는 경우와 구분한다.

## 결과
- 긍정: 세트 제출과 복습 채점이 같은 내부 시험 축에서 first_attempt를 계산하고, code/ID 입력이 같은 활성 회차·오답 집계를 공유한다.
- 부정/제약: 이전 구현에서 code 값으로 저장된 세션·attempt를 변환하는 데이터 마이그레이션은 포함하지 않는다. 원격 DB 적용은 별도 검증이 필요하다.

## 대안과 금지 사항
- HTTP 요청값을 source/repository/grading에 그대로 전달 — 저장 축과 활성 회차 중복을 만들 수 있어 금지한다.
- 응답에 요청에서 사용한 입력값을 그대로 반환 — 같은 시험의 응답 식별자가 입력 표기에 따라 달라지므로 금지한다.

## 참고
- src/infra/persistence/review-exam-resolver.ts
- src/infra/http/review/routes.ts
- tests/worker/review-api.test.ts
