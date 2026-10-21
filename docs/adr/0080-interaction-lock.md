---
id: ADR-0080
title: 중복 인터랙션 잠금 — 시작·제출 동기 가드와 충돌 CTA 차단
status: Accepted
date: 2026-10-21
related: [ADR-0020, ADR-0021, ADR-0059]
---

# ADR-0080: 중복 인터랙션 잠금 — 시작·제출 동기 가드와 충돌 CTA 차단

## 배경
- #270: 학습 시작·이어풀기·복습 시작·제출·포기 상태 변경 중 중복 호출·화면 경합.
- 서버 정합성은 DB 제약으로 보장됨(부분 UNIQUE·조건부 submit·ON CONFLICT).
- 부족은 클라이언트 잠금과 pending 중 충돌 CTA 활성 상태임.

## 결정
- 시작·제출·복습 시작에 동기 in-flight 가드(`useInFlightGuard`) 추가. 복습은 연속 클릭 3→1회로 재현 확인.
- 시작 pending 잠금 기준: 경합 위험 조작만 차단 — 이력 이동·범위 라디오·영역 select·충돌 이어풀기. 문항 이동 등 비충돌 조작은 차단 금지.
- 제출 pending 중 답안·Pass·지우기·포기 비활성화 및 핸들러 조기 복귀. 확정 다이얼로그 취소도 pending 중 잠금 — 확정 후 취소는 실제 요청 취소가 아니므로 포기 다이얼로그와 동일 정책.
- 서버·마이그레이션·인증 변경 없음.

## 결과
- 긍정: 연속 클릭·Enter 경합 1회 요청, 무한 비활성화 없음.
- 부정/제약: 사전 렌더 전 틈새는 가드로만 축소, 서버가 최종 정합 보장.

## 대안과 금지 사항
- 멱등키 도입 금지(근거 없음).
- 비충돌 조작(문항 이동) 전면 차단 금지.
- AppShell·신고·근거 CSS·하네스 변경 금지(#273·#271·#272·#279).

## 참고
- #270, `tests/ui/study-interaction-lock.test.tsx`, `tests/ui/review-interaction-lock.test.tsx`, `e2e/features/async-states.feature`.
