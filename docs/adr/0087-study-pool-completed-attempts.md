---
id: ADR-0087
title: 기풀이 표시 기준과 계정·시험 격리
status: Accepted
date: 2026-10-22
related: ["#311", "ADR-0020"]
---

# ADR-0087: 기풀이 표시 기준과 계정·시험 격리

## 배경
- 학습 풀은 기존에 모든 문제를 미풀이로 반환해 제출 이력이 있는 문제가 다시 출제됐다.
- 이슈 #311에서 풀이 여부를 제출 완료한 정답·오답으로 한정하고, 포기·진행 중 세트·Pass·미응답은 제외하기로 확정했다.
- 문제 개정이 있어도 같은 문제의 이력은 유지해야 하며 사용자와 시험 사이에 이력이 섞이면 안 된다.

## 결정
- attempted는 같은 user_id, exam_id, question_id의 study_attempts 중 `excluded_at IS NULL`이고 출처가 세트이며 연결된 study_sets.status가 submitted이고 결과가 correct 또는 wrong인 행이 있을 때 참이다.
- 이력은 버전 ID가 아닌 안정적인 question_id로 묶는다. 문제 개정 후에도 기풀이 상태를 이어간다.
- 정정으로 제외된 시도(`excluded_at IS NOT NULL`), Pass, 미응답, active·abandoned 세트, 세트 밖 출처는 기풀이로 세지 않는다.
- 누적 오답 가중치(wrongCount) 계산은 이 결정 범위에 포함하지 않는다. 스키마 변경은 없다.

## 결과
- 긍정: 완료된 채점 이력만 미풀이 우선 선정에서 제외하고, 계정·시험 경계를 유지한다. 기존 시도 기록을 재사용한다.
- 부정/제약: 문제 풀 조회에서 사용자와 시험별 이력을 추가로 읽는다. 오답 누적 가중은 별도 구현이 필요하다.

## 대안과 금지 사항
- 진행 중·포기·Pass·미응답까지 풀이로 취급하는 방식은 확정 정책과 맞지 않아 적용하지 않는다.
- question_version_id로 이력을 묶으면 개정 뒤 같은 문제가 다시 미풀이가 되므로 사용하지 않는다.

## 참고
- 이슈 #311 수용 기준, src/infra/persistence/study-pool-history.ts, tests/worker/study-api.test.ts
