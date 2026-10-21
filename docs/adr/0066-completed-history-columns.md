---
id: ADR-0066
title: 완료한 학습 목록의 컬럼 표·숫자 서체와 모바일 라벨-값 카드
status: Accepted
date: 2026-10-21
related: [ADR-0012, ADR-0062, ADR-0064]
---

# ADR-0066: 완료한 학습 목록의 컬럼 표·숫자 서체와 모바일 라벨-값 카드

## 배경
- 이슈 #224 추가 피드백: 완료 목록이 `날짜 · 범위 · 정답률 N% · N문제` 한 줄 텍스트로 표시되어
  날짜·범위·정답률·문항 수의 시작점·끝점이 어긋난다. 사용자가 monospace·컬럼화를 요청했다.
- 기존 목록은 `ul/div` 나열이라 표 의미가 없고, 항목 전체가 버튼이라 행 단위 안내가 불가능했다.
- DESIGN §5·§9(수용 게이트), ADR-0036(표시 계층만 변경)을 따른다.

## 결정
1. **완료 탭 전용 목록 + variant** — `src/ui/history/CompletedHistoryList.tsx`(표·카드 렌더러),
   `CompletedHistoryRow.tsx`(행 표시 모델·서체 규칙), `CompletedHistoryDetail.tsx`(공유 상세 대화상자)
   와 `src/ui/study/HistoryView.tsx`의 `variant`('inline'|'columns'). 기본값 `inline`이라 학습 화면
   (StudyScreen) 이력 목록은 DOM·동작이 그대로다.
2. **데스크톱(≥768px)은 의미 있는 표** — `table > caption(sr-only) + thead th[scope=col] + tbody`.
   컬럼은 `완료일 / 학습 범위 / 정답률 / 문항 수 / 상세 보기`. `table-layout: fixed` + 열 폭
   (26/23/12/15/24%)으로 헤더와 셀의 열 위치·폭이 항상 일치한다. 정렬은 헤더·셀이 같은 열
   클래스 기준(숫자 열 오른쪽·나머지 왼쪽)이라 헤더와 셀의 정렬도 같다.
3. **숫자 셀만 고정폭** — 완료일·정답률·문항 수는 `font-variant-numeric: tabular-nums` +
   `var(--moi-font-mono)`(tokens.ts `typography.fontMono` 단일 소스). 한국어 범위명·헤더·단위는
   본문 서체(한글 폴백)를 유지한다. 날짜를 모르면 `copy.study.unknownDate`를 본문 서체로 보여
   1970 오표기를 재발시키지 않는다.
4. **모바일(≤767px)은 라벨-값 카드** — `ul > li > dl(dt/dd)`. 고정폭 표를 억지 축소하거나 가로
   스크롤로 숨기지 않는다. 전환은 기존 `useMediaQuery`(ADR-0057)와 같은 패턴이며 뷰포트마다
   표와 카드 중 하나만 DOM에 존재한다(중복 노출·중복 읽기 없음).
5. **행 액션** — `상세 보기` 버튼은 `aria-label="<완료일> 상세 보기"`로 어느 행인지 알린다.
   클릭하면 기존 요약 대화상자가 열리고(표에서는 행 아래 전체 폭 상세 행), 안의 링크가
   `/history/detail`로 이동한다. 페이징·빈 상태·스켈레톤·오류 표시는 기존과 동일하다.
6. **데이터·집계·API·DTO·D1 불변** — `correctCount`·`accuracyPercent`·`submittedAt`·`mode`를 그대로
   표시한다. 새 문구는 `copy.ts`의 `history` 블록에만 추가한다.

## 결과
- 긍정: 날짜·정답률·문항 수가 자리수와 무관하게 같은 열에 정렬된다. 스크린리더는 표 헤더로
  컬럼을 알 수 있고 행별 버튼 이름이 달라진다. 모바일에서 표가 무너지지 않는다.
- 부정/제약: `HistoryView`에 variant 분기가 생긴다(기본값 inline이라 학습 화면은 불변). 표 텍스트는
  16px(DESIGN 보조 설명 16px 이상 기준, 본문 18px 미채택). jsdom은 matchMedia를 모의해야 한다.

## 대안과 금지 사항
- div 나열로 표 외형만 흉내내는 구현 — 금지(접근성 정보 없음).
- 모바일 가로 스크롤 컨테이너만 — 5열을 320px에 담기엔 스크롤이 과다해 카드를 택했다.
- 항목 전체를 버튼으로 유지 — 금지(행 단위 안내 불가·열 정렬과 충돌).
- `history.css` 밖의 study 액션 CSS(#232 소유)·통계 패널·탭 구현은 손대지 않는다.

## 참고
- 이슈 #224·#212·#215·#148. 증거: `/Users/young-mini/Workspace/moi/tmp/224-completed-columns/`.
- 테스트: `tests/ui/history-columns.test.tsx`, `e2e/features/history-tabs.feature`.
