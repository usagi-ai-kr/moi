---
id: ADR-0050
title: 하이브리드 기기 터치 타깃 44px
status: Accepted
date: 2026-10-20
related: ["#148", "ADR-0012", "ADR-0035"]
---

# ADR-0050: 하이브리드 기기 터치 타깃 44px

## 배경
- 터치 타깃 최소 44×44px는 디자인 계약이다(DESIGN.md 5항, #148). 제품 CSS는 이 크기를 `@media (pointer: coarse)` 안에서만 적용했다.
- `pointer`는 **주 포인터**를 본다. 터치 화면이 있는 랩톱·태블릿(하이브리드 기기)은 마우스·트랙패드 주 포인터가 `fine`이라 해당 규칙이 매칭되지 않고, 터치 타깃이 40px(`--moi-control-h`)로 낮아진다.
- Tailwind/shadcn 쪽은 `min-h-[44px]`·`min-w-[44px]`를 무조건 적용해 이미 44px다. 포인터 조건이 걸린 터치 크기 규칙은 제품 CSS 두 곳뿐이다(`src/ui/styles.css`, `src/ui/study/study.css`).

## 결정
- 터치 타깃 규칙의 판정 기준을 **`(any-pointer: coarse)`**로 통일한다. `any-pointer`는 터치 입력이 하나라도 있는 기기에서 매칭되며 주 포인터가 coarse인 경우를 포함(상위 집합)하므로 `(pointer: coarse)` 단독 사용을 대체한다.
- 적용 지점은 `src/ui/styles.css`(홈 학습 CTA)와 `src/ui/study/study.css`(풀이 주요·보조 버튼·범위 선택) 두 곳이다. 나머지 터치 타깃은 무조건 44px 규칙을 유지한다.
- 터치가 없는 데스크톱의 시각 높이 40px(`--moi-control-h`)는 유지한다. 키보드·마우스 사용 환경에서 화면 밀도가 낮아지지 않는다.
- 회귀 방지를 단위 테스트로 고정한다(`tests/unit/ui/touch-target-media.test.ts`): Chromium 하이브리드 포인터 에뮬레이션(primary=fine · any=coarse) 페이지에서 실제 CSS 적용 높이가 44px 이상인지 확인하고, `src/**` CSS에 `(pointer: coarse)` 단독 미디어 쿼리가 남지 않는지 정적 검사한다.

## 결과
- 긍정: 터치 화면이 있는 기기에서도 터치 타깃이 44px로 보장된다(이번 이슈의 재현 조건 해소). 판정 기준이 하나(`any-pointer`)로 통일되어 규칙 수가 늘지 않는다.
- 부정/제약: 단위 테스트의 하이브리드 에뮬레이션은 Chromium `--blink-settings`(primaryPointerType/availablePointerTypes) 디버그 설정에 의존한다. 이 설정이 무시되면 에뮬레이션 사전 조건 assertion이 실패해 fail-closed로 드러난다. 비-Chromium 브라우저는 단위 테스트에서 직접 검증하지 않되 판정 기준 자체는 표준 CSS 미디어 기능이다.

## 대안과 금지 사항
- 대안(두 쿼리 병기): `any-pointer: coarse`가 `pointer: coarse`를 포함하므로 중복이고 의미가 없다. JS로 터치 여부를 감지해 클래스를 토글하는 방식은 첫 페인트·서버 렌더와 어긋나고 비용이 크다. 무조건 44px 적용은 데스크톱 시각 규칙(40px)을 위반한다.
- 금지: 터치 타깃 규칙에 `(pointer: coarse)` 단독 사용, 포인터 판정을 JS로 우회, 토큰(`--moi-touch-min`)을 CSS 밖에서 하드코딩.

## 참고
- related #148(작업 이슈), DESIGN.md 5항(버튼·터치 타깃), ADR-0012(디자인 시스템), ADR-0035(shadcn/ui·Tailwind 전환).
