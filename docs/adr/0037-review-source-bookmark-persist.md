---
id: ADR-0037
title: 0.2.4 복습 소스·북마크 영속 및 원자 채점 필수 연결
status: Accepted
date: 2026-10-19
related: []
---

# ADR-0037: 0.2.4 복습 소스·북마크 영속 및 원자 채점 필수 연결

## 배경
- #51 오답(Pass·미응답 포함)·북마크·D1 재개는 0.2.4 필수다. 범위 축소·0.3 연기는 금지다.
- phase1(#54 원자 채점 필수주입)은 승인된 계약이다. 이번 단위는 D1 소스·북마크 저장만 하며 HTTP/UI는 다음 단위다.

## 결정
- `review_bookmarks(user_id, question_id)` UNIQUE·FK 영속을 채택한다. 개인별 토글로 추가·해제한다.
- `ReviewSourcePort` D1 구현: 유효 attempt(`wrong/pass/unanswered`, `excluded_at IS NULL`)만 집계한다. `correct`는 제외한다.
- 시험·사용자 격리, 비활성·중지 문제 제외, 최신 활성 버전 매핑은 `study-pool` 기준을 재사용한다.
- `answerReviewItem`은 `grading.commit` 필수주입만 사용한다. 순차 `save+recordBatch` fallback을 금지한다.
- 불확정 정책(Proposed로 분리): 북마크 `validWrongCount` 표시값, 경합 시 토글 선형화, 0행·`firstAttempt` 교차경합 잔여 한계.

## 결과
- 긍정: 오답·북마크 D1 재개가 Worker 통합으로 증명된다. phase1 코드 훼손이 없다.
- 부정/제약: HTTP/UI·모바일 대응은 미완료로 남는다. 원자어댑터 0행·교차경합 잔여는 `false`·쓰기없음으로만 보장한다.

## 대안과 금지 사항
- 이메일·닉네임 핵심키화 금지. PASETO·토큰 브라우저 노출 금지.
- 기존 ADR 본문 수정 금지. ADR-0030의 0.3 이관 상태 변경은 별도 동기화 단위이며 이번 PR에서 일괄 supersede하지 않는다.

## 참고
- `src/infra/persistence/review-source-repository.ts`, `schema-review-bookmarks.ts`, `0012_add-review-bookmarks.sql`
- `tests/worker/review-source.test.ts`, `tests/worker/review-source-integration.test.ts`
