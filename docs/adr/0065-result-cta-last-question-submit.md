---
id: ADR-0065
title: 결과 CTA 밑줄·마지막 문항 제출 위치·결과 종료 동선
status: Accepted
date: 2026-10-21
related: ["#232", "ADR-0036", "ADR-0050", "ADR-0064"]
---

# ADR-0065: 결과 CTA 밑줄·마지막 문항 제출 위치·결과 종료 동선

## 배경
- 결과 CTA(`Button asChild`+`Link`)에 전역 UA 밑줄 노출, 풀이·결과 마지막은 `다음` disabled만 잔류.
- 근거 링크(`source-links`·`moi-note`·`moi-explanation`)는 링크 구분 유지 필요. #232·DESIGN §5·7·9.

## 결정
- 밑줄: `[data-slot='button']`에 `text-decoration:none`(hover/focus/active 포함). 근거 링크 밑줄 유지, 전역 `a{none}` 금지. hover 0.92·active 0.88·disabled 0.5·focus 링은 ADR-0064 유지.
- 풀이 마지막: 하단 `[이전][제출하기 (N 미응답)]`, 상단 제출 숨김(제출 CTA 상태당 1개). `onSubmitRequest`·확인 모달·pending/disabled·이중방지·실패재시도 유지, API/도메인 변경 없음.
- 결과 마지막: 페이저 `[이전][결과 요약으로]`. 요약 h1(`#moi-study-result-summary`)로 스크롤+포커스만, 제출/채점/API/attempt 저장 없음. ArrowRight 마지막 정지 유지.
- 레이아웃: 기존 `moi-study-nav/pager-nav` flex-wrap+gap 재사용, Button 44px(ADR-0050), 5폭·200%·focus/disabled/pending 검증.
- 그룹 구조(#232 후속): 문항 상세는 정보(`dl.moi-study-meta` 번호·채점·응답·선택·정답)·액션(`.moi-study-item-actions` 북마크/신고)·탐색·해설/근거 그룹으로 분리. 그룹 사이 space-3(12px), 안은 space-2(8px). `ResultView`→`ResultPager`·`ResultItemDetail` 추출로 250줄 상한 준수.
- 액션 버튼: 북마크 44px+`aria-pressed`+접근 이름(색만 구분 금지), 신고 44px 보조 액션(hover/active/disabled/focus, 밑줄 유지). 풀이·결과가 `study-feedback.css` 공유 그룹을 사용.
- 확인 다이얼로그(#232 후속): `widgets.css` `.moi-alert` `max-width:100%`로 #225 전폭 회귀 수정(360px 제거). `.moi-study-confirm`에 위 `space-4`(16px)·아래 `space-5`(24px). `InlineConfirmDialog` mount 시 `focus`+`scrollIntoView`, `tabIndex=-1`·`role=alertdialog` 유지. 문구·제출1회·pending·API/도메인 변경 금지.

## 결과
- 긍정: CTA 일관·마무리 동선 명확·재제출 위험 제거·토큰 단일 소스 유지.
- 긍정(후속): 밀집 해소 — 정보/액션 겹침 0·간격 24px·버튼 44px 정렬, 5폭·200% overflow 0.
- 긍정(확인): 다이얼로그가 study 본문 폭을 채우고 진행 표시와 gap≥16px, mount 포커스로 키보드 동선 유지.
- 부정/제약: 마지막 상단 제출 DOM 미존재(테스트·BDD는 하단 기준), 요약 h1 `tabindex=-1` 예외.

## 대안과 금지 사항
- 상단+하단 중복 제출(접근 이름 중복) 금지, 결과 화면 재제출·채점 API 금지, 신규 문구(`backToSummary`) 외 copy 추가 금지.

## 참고
- #232·DESIGN §5·7·9·ADR-0036·0050·0064·`authenticated.css`·`QuestionView`·`ResultView`·`ResultPager`·`ResultItemDetail` 증거 `tmp/232-result-cta/`·`tmp/232-result-cta/grouping/`·`tmp/232-result-cta/confirm-spacing/`.
