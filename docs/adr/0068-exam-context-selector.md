---
id: ADR-0068
title: 시험 연결 context·selector·URL 계약과 Phase 1/2 경계
status: Superseded by ADR-0077
date: 2026-10-21
related: ["#239", "ADR-0056", "ADR-0058", "ADR-0063"]
---

# ADR-0068: 시험 연결 context·selector·URL 계약과 Phase 1/2 경계

## 배경
- #239 — 학습 현황·영역별 분석·완료한 학습이 AWS SAA-C03 기준으로 조회되는데 화면에 드러나지 않는다. 시험 전환도 요구된다.
- 시험 상수가 UI 12곳에 하드코딩되어 있고(`STUDY_EXAM_ID`·`STUDY_EXAM_LABEL`), DB 안에서 시험 축이 2계층混재한다(`questions.exam_id`·`exam_domains.exam_id`=내부 ID, `study_sets`·`study_attempts`·`review_sessions.exam_id`=공개 코드, ADR-0058).
- 시험 필터가 없는 API는 `GET /api/study/sets`(이력 목록) 1개뿐이다.

## 결정
- **Phase 1/2 경계**: Phase 1 = 표시·context·URL·selector·API 전달(데이터 모델·DB·마이그레이션 변경 0). Phase 2 = 다중 시험 데이터 분리·`GET /api/study/sets?examId=` 필터·D1 스키마.
- **시험 카탈로그 단일 소스**: `src/ui/exam/exam-catalog.ts`의 `EXAM_CATALOG`(공개 코드·표시명·정식명)만 허용목록이다. 시험 추가는 ① 카탈로그에 항목 추가 ② D1 `exams`(code UNIQUE)·`exam_domains`·`questions` 시드 ③ UI 목록 자동 반영. DB에 없는 시험을 UI에 노출하지 않는다.
- **URL 계약**: `?exam=<공개 코드>`가 단일 진실 원천. 없으면 기본값 `saa-c03`(URL 유지), 유효하지 않은 값은 기본값으로 `replace`(히스토리 오염 0). 사용자 시험 변경은 `push`(뒤로가기로 직전 시험 복원)이며 pathname·다른 query(`tab`)를 보존하고 `page`만 1로 초기화한다. 내부 ID(`exam-saa-c03`·UUID)는 URL·화면 모두 노출하지 않는다.
- **컴포넌트 경계**: `ExamScopeProvider`(라우터 내부, `useSearchParams`) → `useExamScope()`(`code`·`examId`·`label`·`exams`·`setExam`) → `ExamSelector`(셸 1곳: 데스크톱 nav·모바일 Drawer, 실제 `<select>`)·`ExamScope`(페이지 시험 라벨). Provider 밖에서는 기본값 context로 동작한다.
- **표시 위치**: 홈·학습 시작·풀이·결과·학습 현황 3탭 상단·복습·계정. 결과 화면은 세트 소유 시험(`set.examId`)을, 나머지는 선택 시험을 표시한다. 북마크 시험 축은 Phase 1에서 선택 시험 기준이다.
- **이력 목록**: Phase 1 무변경(시험 구분 없이 전 시험 이력 표시). 시험별 필터는 Phase 2로 명시한다.

## 결과
- 긍정: 시험 기준이 모든 주요 화면에 드러나고, 시험 추가 시 목록·selector·API 전달이 자동으로 따라간다. 단일 시험 하드코딩이 사라진다.
- 부정/제약: 이력 목록은 Phase 2까지 시험이 섞인 상태로 보인다. 북마크는 세트 소유 시험이 아닌 선택 시험 축으로 기록된다(Phase 1 단일 시험이라 표면 차이 없음).

## 대안과 금지 사항
- 이력 목록의 시험 필터링·D1 마이그레이션·다중 시험 데이터 분리를 Phase 1에 포함 금지.
- 허용목록 없는 자유 `?exam=` 허용(임의 코드·내부 ID 노출) 금지. 가짜 비활성 selector 유지 금지. 단일 시험 하드코딩 재도입 금지.

## 참고
- `src/ui/exam/*`, `docs/adr/0056`·`0058`·`0063`, 이슈 #239, DESIGN.md §1(내부 식별자 비노출).
