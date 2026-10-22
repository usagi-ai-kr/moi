---
id: ADR-0062
title: 공통 브랜드·헤더 토큰 계약
status: Accepted
date: 2026-10-21
related: ["#225", "ADR-0012", "ADR-0014", "ADR-0032", "ADR-0054", "ADR-0057", "ADR-0060"]
---

# ADR-0062: 공통 브랜드·헤더 토큰 계약

## 배경
- 첫 화면(loading/error/logged-out)은 favicon 없음·fixed 56px·baseline·tagline 병기, 로그인 셸은 favicon 22px·sticky 61px·center, Drawer 헤드는 텍스트만으로 3종 불일치였다.
- ADR-0032(첫 화면 문구)는 ADR-0060으로 대체되어 tagline을 헤더에 둘 수 없고, ADR-0054 favicon 자산·ADR-0057 Drawer 계약은 유지해야 한다.

## 결정
- `Brand` 공용(`src/ui/Brand.tsx`+`brand.css`)을 단일 소스로 둔다. Router 비의존 장식 img(`/favicon.svg`, alt ""·aria-hidden)+`copy.brand` 텍스트이며, 링크 래퍼는 사용처(`AppShell` Link)가 제공해 중첩 링크·중복 접근 이름을 방지한다.
- 크기·간격·높이는 `tokens.ts` 단일 소스만 사용한다: 브랜드 아이콘 `brandIconSize`(22)·간격 `space-2`·헤더 높이 `shellHeaderHeight`(61). CSS·TSX에 22·61px 리터럴을 새로 두지 않는다. 구 `headerHeight`(56) 토큰은 값만 유지하고 CSS 사용을 중단한다.
- 첫 화면 헤더를 셸 규격(sticky·61·center)으로 통일하고 본문 offset을 셸과 동일(`calc(100dvh - shell-header-h)`·`space-4`)로 맞춰 이중 여백·본문 가림을 만들지 않는다. tagline은 본문 lead로만 유지한다.
- 초기 번들에는 Router·lucide·모달을 유입하지 않는다. `Brand`는 `copy`·`tokens`·토큰 CSS만 import한다.

## 결과
- 긍정: 3종 헤더 동일 자산·높이·본문 시작, Drawer 61px 유지·포커스 회귀 보존, 5폭+200% 실측 일치.
- 부정/제약: 구 56px 토큰은 미사용 잔류(호환 유지). h1·버튼·폭·상태 등 전체 디자인 불일치는 후속 단위로 분리한다.

## 대안과 금지 사항
- favicon 한 줄 삽입만으로 통일 완료 표기(반려): 규격·offset·접근 이름까지 통일해야 한다.
- 헤더 tagline 병기·홈 안내 문구 복원(금지): ADR-0060을 승계한다.
- 신규 Router·lucide·모달 초기 유입(금지): 번들 검사로 차단한다.
- #223 ADR-0061·홈 ADR-0060 본문 수정(금지): 본 결정에서 승계만 한다.

## 참고
- #225 / DESIGN.md §2·4·5·9 / ADR-0012(토큰·문구 중앙관리) / ADR-0054(favicon) / ADR-0057(Drawer) / ADR-0060(홈 문구 삭제 승계).
