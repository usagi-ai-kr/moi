---
id: ADR-0056
title: 학습 타임스탬프 표시 규약과 단일 시험 상수
status: Accepted
date: 2026-10-20
related: ["#212", "#148"]
---

# ADR-0056: 학습 타임스탬프 표시 규약과 단일 시험 상수

## 배경
- study set `submittedAt`/`createdAt`은 서버 저장 단위가 epoch seconds다(`study/runtime.ts` clock `Math.floor(Date.now()/1000)`). UI `formatDateTime`이 초를 ms로 해석해 `1970-01-22`로 표시됐다(#212).
- 현재 지원 시험은 SAA-C03 1개인데 시험 option/label이 화면마다 분산되어 있었다. 미지원 시험을 선택 가능하게 만들면 안 된다.

## 결정
- (a) 서버 저장 단위는 epoch seconds로 둔다. UI 표시에서만 `value<1e12→ms` 정규화·`Asia/Seoul` 한국어 형식·`0/손상값→날짜 정보 없음` fallback을 적용한다. DB·API·마이그레이션은 변경하지 않는다.
- (b) 지원 시험은 SAA-C03 단일이며 `src/ui/study/types.ts` `STUDY_EXAMS` 상수로만 UI에 제공한다(`{id:'saa-c03',label:'AWS Certified…'}`). `StartView`·Home은 상수를 렌더하고 단일 disabled 옵션으로 미지원 선택을 불가하게 한다.
- (c) 향후 시험 추가 시 `STUDY_EXAMS` 배열 확장과 선택·상태 인터페이스 분리를 우선한다. 시험별 pool·통계 분기는 기존 examId 스코프를 따른다.

## 결과
- 긍정: 이력 날짜 1970 오표기 제거·손상값 안전 표시, 시험 정보 단일 진실 원천.
- 부정/제약: `STUDY_EXAM_ID`·`copy.study.examOption`과 문자열 중복이 남는다. 값 불일치는 `ux-polish-212` 테스트(초/ms·경계·selector 단일 옵션)로 검출한다.

## 대안과 금지 사항
- 서버 저장값을 ms로 마이그레이션 — 기존 세트·통계 정합 위험으로 금지한다.
- 미지원 시험을 선택 가능한 형태로 노출 — 허위 선택지로 금지한다.
- 표시 함수에서 저장값·API DTO를 변환 — 표시 전용 정규화로 한정한다.

## 참고
- 이슈 #212, #148, PR #216 후속 비차단 보강.
- `src/ui/study/types.ts`, `src/ui/study/StartView.tsx`, `src/ui/AuthenticatedApp.tsx`, `tests/ui/ux-polish-212.test.tsx`.
