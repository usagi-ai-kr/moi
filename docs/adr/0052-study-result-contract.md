---
id: ADR-0052
title: 학습 결과 제출 계약 정합
status: Accepted
date: 2026-10-20
related: [ADR-0049]
---

# ADR-0052: 학습 결과 제출 계약 정합

## 배경
- 서버 제출 계약(`src/infra/http/study/routes.ts`): `POST /api/study/sets/:id/submit`·`GET /api/study/sets/:id`는 제출 후 도메인 세트 원본을 그대로 반환한다. 제출 후 문항은 `answerOptionIds`·`explanation`·`sourceUrls`를 갖고 `answerCount`는 없다. `answerCount`는 제출 전 `toActiveDto`만 만든다(ADR-0049).
- 클라 불일치(`src/ui/api/client.ts`): `StudySubmittedItem extends StudyActiveItem`이 서버가 보내지 않는 `answerCount`를 필수로 강제했다.
- `ResultView.ReviewShortcut`은 `useInRouterContext` 분기로 라우터 밖에서 일반 anchor를 렌더해 풀 리로드를 유발했다. 프로덕션(`AuthenticatedApp`의 `BrowserRouter` 안)에서는 항상 라우터 안이다.

## 결정
- `StudySubmittedItem`을 `StudyActiveItem` 상속에서 분리해 서버 계약 그대로 독립 정의한다: `answerOptionIds`·`explanation`·`sourceUrls` 포함, `answerCount` 없음. 제출 전 `StudyActiveItem.answerCount` 필수와 정답 ID 비노출은 유지한다.
- `isSubmittedSet` 판별자는 `StudyActiveSet | StudySubmittedSet`을 받아 좁힌다. `getStudySet` 공용 반환 타입은 유지해 `queries`·`useStudyFlow`·`useTabState`·`draft-sync`로의 ripple을 없앤다.
- `ReviewShortcut`은 항상 `Link`를 쓴다(`useInRouterContext`/anchor 폴백 제거). `ResultView` 테스트 렌더는 `MemoryRouter`로 표준화한다.
- e2e `review.steps.ts`의 `answerCount ?? 1` 폴백 3건을 제거하고(`ReviewMockItem.answerCount` 필수값 실사용), `submittedDto` 문항을 서버 계약(`answerOptionIds`, `answerCount` 없음)에 맞춘다.

## 결과
- 긍정: 제출 후 타입이 서버 계약과 일치하고, 오답/북마크 바로가기가 항상 SPA 이동(풀 리로드 없음)이다.
- 부정/제약: `getStudySet` 타입은 제출 세트까지 `StudyActiveSet`으로 표기하는 기존 완화가 남는다. 제출 후 `answerOptionIds`는 스냅샷 정답 집합이라 결과 화면에서 직접 정답 노출에 쓰지 않고 `result.perItem`만 쓴다.

## 대안과 금지 사항
- 서버 DTO에 `answerCount`를 추가하는 계약 변경 금지 — 클라만 고친다.
- 제출 전 문항에 `answerOptionIds`·`correctOptionIds` 노출 금지(ADR-0049 마스킹 유지).
- `getStudySet` 반환을 유니온으로 넓혀 공용 훅을 수정하는 설계 금지(ripple 최소화 우선).
- `HistoryView` 등 다른 폴백·`copy`·스타일·Worker 코드는 범위 밖이라 손대지 않는다.

## 참고
- #176, #51, `src/ui/api/client.ts`, `src/ui/study/ResultView.tsx`, `e2e/steps/review.steps.ts`.
