---
id: ADR-0074
title: 북마크 상태 모양 구분·정답 표시 중복 제거·날짜 하한·페이저 간격
status: Accepted
date: 2026-10-21
related: ["#260", "ADR-0056", "ADR-0073"]
---

# ADR-0074: 북마크 상태 모양 구분·정답 표시 중복 제거·날짜 하한·페이저 간격

## 배경
- #233 Slice C가 `★/☆` 기호를 같은 Lucide `Bookmark` 아이콘으로 바꿨다. 아이콘은 같아졌지만 **설정/미설정 시각 구분**(모양)이 사라져 상태를 아이콘만으로 읽을 수 없었다(#260).
- `ReviewFeedback` 정답 보기는 Check 아이콘과 `✓` 문자를 같이 그려 같은 내용을 두 번 표시했다(#260).
- `formatDateTime`은 `0`·손상값만 되돌렸다. 작은 양수(1~86399 등)는 1970년 날짜로 표기됐다(#260).
- 결과 상세 카드와 페이저 이동(이전/다음) 영역 간격이 8px로 붙어 보였다(#260).

## 결정
- (a) 북마크 설정/미설정은 **같은 `Bookmark` 아이콘의 채움(fill)으로 구분**한다. 설정=`fill="currentColor"`, 미설정=`fill="none"`. 아이콘 export는 액션별 1개만 유지한다(ADR-0073의 `icons.ts` 계약 유지) — `★/☆` 기호나 신규 아이콘 계열을 쓰지 않는다.
- (b) 상태는 **색이 아니라 모양(채움) + 텍스트 라벨 + `aria-pressed`**로 함께 알린다. 색만으로 상태를 전달하지 않는다(DESIGN.md §4).
- (c) 정답 보기는 **Check 아이콘 + 텍스트 `정답`만** 남기고 `✓` 문자를 제거한다. 상단 배지 문구는 `copy.review.correctBadge`를 재사용한다.
- (d) `formatDateTime`은 저장 단위(epoch seconds) 정규화 후 **하한 1971-01-01(UTC, 31,536,000초) 미만 값을 '날짜 정보 없음'**으로 되돌린다. 하한은 표시 전용 판단이며 DB·API·저장값은 바꾸지 않는다(ADR-0056 (a) 유지). 계정 DTO 정규화 함수는 UI(`src/ui/api/session-client.ts`)에서 `toEpochValue`로 명명 정리하고 단위(epoch seconds) 고정 주석을 명시한다 — infra의 동명 함수는 범위 밖이다.
- (e) 결과 상세 카드 → 페이저 이동(이전/다음) 간격은 **24px(`var(--moi-space-5)`)** 로 보강한다. 간격은 컨테이너 gap이 아니라 요소별 `margin`으로 명시해(진행 표시 → 카드는 8px 유지) 카드와 이동 영역만 넓힌다. 하드코딩 px는 쓰지 않는다.

## 결과
- 긍정: 북마크 상태가 아이콘 모양으로 구분되고, 정답 표시 중복이 사라졌으며, 1970 오표기가 차단되고, 결과 카드와 이동 영역이 24px로 분리된다.
- 부정/제약: 하한 미만 값은 '정보 없음'으로 보이며 정보를 잃는다(1971년 이전 데이터는 이 앱에 존재하지 않음). 하한은 상수로 하드코딩하며 테스트가 경계를 고정한다. 페이저 간격은 요소별 margin이라 컨테이너 gap은 0이 되고, 자식 추가 시 간격을 명시해야 한다.

## 대안과 금지 사항
- `★/☆` 텍스트 기호 복귀 — Lucide 단일 계열 계약 위반(ADR-0073).
- 아이콘 계열 추가(예: `BookmarkCheck`) — 액션별 export 1개 규칙과 매핑표 정본 위반. 색만 변경하는 방식도 금지.
- 서버 저장값·마이그레이션 변경 — ADR-0056 (a)·DB 계약 위반. 하한은 표시 계층에서만 적용한다.

## 참고
- 이슈 #260, `src/ui/review/BookmarkButton.tsx`, `src/ui/review/ReviewFeedback.tsx`, `src/ui/study/types.ts`, `src/ui/study/study-result.css`, `src/ui/api/session-client.ts`, `DESIGN.md` §4.2, `tests/ui/ux-polish-260.test.tsx`, `tests/unit/ui/study-pager-gap-260.test.ts`, `e2e/features/study.feature`.
