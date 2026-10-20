---
id: ADR-0059
title: 복습 10문항 회차와 remaining/cycle 큐
status: Accepted
date: 2026-10-21
related: ["#221", "#219", "ADR-0020", "ADR-0027", "ADR-0041"]
---

# ADR-0059: 복습 10문항 회차와 remaining/cycle 큐

## 배경
- 복습 대기 목록이 문항 stems를 모두 나열해 길어지고, 후보가 많으면 한 회차가 과도하게 길어진다.
- 단순 slice는 "남은 15문항에서 다음 회차"를 보장하지 못한다. 매 시작마다 전체를 다시 섞으면 이전 회차와 중복·누락이 생긴다.

## 결정
- 대기 UI는 개수만 표시한다(`복습 대기 N문제`, stem 목록 미노출). `10문제씩 진행됩니다`를 안내한다.
- 한 회차는 `REVIEW_ROUND_SIZE=10`이다. 후보 10개 이하는 전체, 초과는 10문항만 시작한다.
- `review_sessions`에 `remaining_question_ids`·`cycle_question_ids`(JSON text, nullable)를 둔다(0013). 기존 행은 null(legacy)이다.
- plan은 현재 후보와 직전 ended queue를 병합한다. 신규는 cycle·remaining에 append, 사라진 후보는 제거한다. remaining이 비면 현재 후보 전체로 새 cycle을 연다. legacy ended는 `현재-직전 items`를 remaining으로 쓴다.
- start는 plan remaining에서 mode 가중치(`pickOrder`)로 최대 10개를 뽑아 스냅샷하고 `remainingAfter`·`cycle`을 저장한다.
- end는 미채점(pending)을 remaining에 재입대한다(채점분은 소비). `end` CAS와 함께 원자 갱신한다.
- GET candidates total은 plan remaining 개수이다. 활성 회차가 있으면 current를 우선 표시한다.
- 큐는 mode별 독립, 시험·계정 격리를 유지한다. `REVIEW_MIN_CANDIDATES=1`을 유지한다.

## 결과
- 긍정: 25→10→10→5→새 cycle로 예측 가능한 분할, early end pending 복귀, 중복·누락 방지.
- 부정/제약: 스키마 2컬럼 추가, legacy 분기 유지, total과 items 길이 불일치(호환용).

## 대안과 금지 사항
- 단순 slice로 매번 전체 재셔플 — 중복·누락이 생겨 금지한다.
- 대기 stems 전체 나열 — 개수 표시로 대체한다. 금지한다.
- ADR-0020의 "문제 수 제한 없음" 계약 — 본 ADR로 대체한다(`Superseded by ADR-0059`).

## 참고
- src/domain/review/round-queue.ts, src/app/review/index.ts, src/infra/persistence/schema-review.ts
- tests: domain/app/D1/RTL, migration 0013
