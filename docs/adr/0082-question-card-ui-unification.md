---
id: ADR-0082
title: 학습·복습 문제 풀이 카드 UI 공통화
status: Accepted
date: 2026-10-21
related: ["#274", "#275", "#270", "ADR-0073", "ADR-0081"]
---

# ADR-0082: 학습·복습 문제 풀이 카드 UI 공통화

## 배경
- 일반 학습과 복습의 문제 풀이 표면(stem 크기, 선택지 행, fieldset, 진행 표시, 북마크/신고 위치)이 달랐고, 복습 UI를 시각 기준으로 통일 요청(#274)이 있었다.
- 모드별 채점 방식(학습=제출 시 일괄 채점, 복습=즉시 채점)은 유지해야 했다.

## 결정
- `src/ui/components/question-card.tsx`, `option-row.tsx`, `option-fieldset.tsx`, `question-card.css`를 공통 컴포넌트로 둔다.
- 복습 카드 시각 언어를 기준으로 일반 학습에 적용한다. 모드별 로직은 유지한다.
- 학습 북마크·신고는 카드 헤더(제목→액션→보기)에, 복습은 기존 헤더를 유지한다.
- 복습에도 4px 진행 바를 추가하고 fieldset UA border/padding을 초기화한다.
- #274 범위에서는 `copy.ts`·`StartView`·`StudyScreen`·API/서버/D1/ADR-0081을 변경하지 않는다.

## 결과
- 긍정: 320/375/768/1024/1280·200% overflow 0, 44px 위반 0. r 승인. #275 4/8과 통합 배포(Worker c3f725ff, dev ebb350c).
- 부정/제약: 진행 텍스트 포맷·컨테이너 max-width·셸 포커스·stem Markdown은 #268로 분리.

## 대안과 금지 사항
- 모드별 로직을 공통 컴포넌트에 섞지 않는다(채점 방식은 각 화면 책임).
- API/서버/D1/ADR-0081 변경 금지.

## 참고
- 이슈 #274, #275, #270. ADR-0073(아이콘), ADR-0081(4/8).
