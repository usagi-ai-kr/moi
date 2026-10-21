---
id: ADR-0069
title: nav 워드마크 Bricolage Grotesque 적용
status: Accepted
date: 2026-10-21
related: ["#225", "ADR-0012", "ADR-0014", "ADR-0022", "ADR-0062"]
---

# ADR-0069: nav 워드마크 Bricolage Grotesque 적용

## 배경
- #225 사용자 최종 확정(2026-10-21): 3종 후보 중 Bricolage Grotesque 최종. 상단 nav·Drawer 소문자 `moi`에만 적용, 한국어 본문·버튼·문항·숫자 불변.
- KoddiUD는 눈누 라이선스로 저장소 탑재·수정 금지(ADR-0014), 지연·optional 주입으로 LCP 분리(ADR-0022). 브랜드 폰트는 별도 OFL이라 다른 계약이 필요하다.

## 결정
- `src/ui/Brand`+`brand.css`의 `.moi-brand`에만 `--moi-font-brand` 적용(폴백 display 스택). 전역 font-family·타이틀·본문 변경 금지.
- Bricolage Grotesque 700 m/o/i 서브셋 woff2(1.6KB, Google Fonts `text=moi`)를 `public/fonts/`에 self-host. OFL-1.1 전문 동봉·CSS 주석 고지. OFL은 탑재 허용이라 ADR-0014 금지는 KoddiUD 한정으로 유지.
- `@font-face`는 `swap`+`unicode-range: U+69,6D,6F`로 m/o/i만 사용, 나머지는 폴백. 1.6KB 동일 오리진만 `preload` 허용(대용량 KoddiUD preload 금지는 유지).
- 토큰 단일 소스: `typography.fontBrand`·`brandFontFamily`·`brandFontUrl`→`--moi-font-brand`. weight 700·spacing -0.01em·`optical-sizing:auto`로 22px 아이콘 정렬.

## 결과
- 긍정: 1.6KB라 FOIT·CLS·LCP 영향 미미, 외부 의존 0, 실패 시 이전 표기와 동일.
- 부정/제약: `moi` 외 영문은 폴백 표기. 서브셋 갱신 시 Google Fonts 재생성 필요.

## 대안과 금지 사항
- 전역·타이틀 폰트 교체, Google Fonts 외부 링크 상시 의존 — 금지.
- KoddiUD 바이너리 탑재·서브셋·preload — 금지(ADR-0014/0022 유지).
- 새 런타임 의존성 추가 — 금지.

## 참고
- #225 확정 댓글 / DESIGN.md §4 / `tokens.ts`·`brand.css`·`index.html` / OFL: `public/fonts/OFL-BricolageGrotesque.txt` / Bricolage: https://github.com/ateliertriay/bricolage
