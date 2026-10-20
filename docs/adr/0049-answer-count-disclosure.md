---
id: ADR-0049
title: 제출 전 정답 개수 안내
status: Proposed
date: 2026-10-20
related: []
---

# ADR-0049: 제출 전 정답 개수 안내

## 배경
- 풀이 화면은 정답 개수 안내가 없고, 복습은 항상 "복수 선택이 가능합니다." 고정 문구다(#50/#51).
- 실제 시험처럼 문항별 정답 개수를 미리 알려야 풀이 전략(단일·복수 선택)을 세울 수 있다.

## 결정
- 제출 전 문항 DTO에 정답 개수 `answerCount: number`(정수)만 추가한다. 스냅샷 기준 개수다.
  - 학습 active: `toActiveDto`가 `item.answerOptionIds.length`를 노출한다.
  - 복습 pending: `toPendingDto`가 `ReviewSessionItem.answerOptionIds.length`를 노출한다(current/items/next).
- 정답 ID·정답 여부·해설·근거는 계속 비노출한다. 개수는 정답을 특정하지 않으므로 사전 유출이 아니다.
- UI는 `copy.study/review.answerCountHint(count)` → `정답 N개를 고르세요`를 `QuestionView`·`ReviewQuestion`에 표시하고, 복습 고정 문구를 교체한다.
- 선택 개수 강제 제한은 하지 않는다(안내만, 채점은 기존 집합 기준).

## 결과
- 긍정: 풀이·복습 UX가 시험 규격과 일치, 마스킹 회귀 테스트로 유출 방지 유지.
- 부정/제약: `StudyActiveItem`·`ReviewPendingItem`·`next` DTO와 목업·픽스처에 `answerCount` 필수. 후보 목록·북마크 목록에는 넣지 않는다.

## 대안과 금지 사항
- 정답 ID 배열·correctOptionIds의 제출 전 노출 금지(마스킹 테스트로 차단).
- 클라이언트에서 개수 추론·하드코딩 금지 — 진실 원천은 서버 스냅샷이다.
- 개수 미달·초과 선택의 제출 차단 금지 — 이번 범위는 안내만 한다.

## 참고
- #50, `src/infra/http/study/routes.ts`, `src/infra/http/review/dto.ts`, `src/ui/copy.ts`.
