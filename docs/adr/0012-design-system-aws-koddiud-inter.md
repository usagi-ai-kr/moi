---
id: ADR-0012
title: 디자인 시스템 — AWS 팔레트·KoddiUD 온고딕/Inter·레이아웃·모션
status: Accepted
date: 2026-10-18
related: ["#34", "#1", "#4"]
---

# ADR-0012: 디자인 시스템 — AWS 팔레트·KoddiUD 온고딕/Inter·레이아웃·모션

## 배경
- 로그인 UI(#4) 이전에 색·서체·레이아웃·모션 기준을 확정한다(사용자 지시 2026-10-18).
- 문구·수치의 하드코딩을 금지하고 단일 소스로 중앙 관리해 일관성·유지보수성을 확보한다.

## 결정
- **팔레트**: 액센트는 **AWS 기본 색**(Orange `#FF9900`), 텍스트/서피스는 무채색(AWS Squid Ink `#232F3E` 계열 + 그레이스케일). 장식적 색 추가 금지.
- **서체**: 표시(브랜드·제목)는 **KoddiUD 온고딕**(눈누 #674 · 한국장애인개발원 · 웹 임베딩 허용/수정·재배포 금지), UI 텍스트는 **Inter 계열**(`@fontsource-variable/inter`). 폰트는 전부 **앱 번들 내장**한다: Inter=fontsource 해시 자산, KoddiUD=`src/ui/fonts` → `src/ui/display-font.css`에 **base64 내장**(현재 700 웨이트, 400은 필요 화면 등장 시 추가). 대용량 한글 폰트(라이선스상 서브셋 금지, ~1.6MB)는 **첫 페인트 이후 지연 로드**(`load`+1.2s 후 동적 import → `<style>` 주입)로 임계 경로·초기 측정 구간에서 제외하고 `font-display: swap`, **preload 금지**(대역폭 독점 — 실측 perf 75→55 사례). UI 폰트 스택(fontUi)에는 KoddiUD를 넣지 않는다(한글 UI=시스템 폰트 폴백, 불필요한 1.6MB fetch 방지).
- **레이아웃**: 간격·충돌 방지는 **container 내부 padding**으로 한다. **flex/grid** 사용, **overflow 지양**(스크롤로 해결 금지), **position은 fixed만**(absolute·sticky 회피).
- **모션**: 트랜지션·진입 애니메이션 허용(≤320ms, 지정 easing), `prefers-reduced-motion` 존중. **hover 의존 상호작용 금지**(터치·키보드 기준, 포커스 가시성은 유지).
- **변수화(중앙 관리, 하드코딩 금지)**: 색·박스모델·타이포·모션 값은 `src/ui/tokens.ts`가 단일 소스다. `applyTokens()`가 CSS 변수(`--moi-*`)로 주입하고, CSS는 그 변수만 소비하며, AntD 테마(`src/ui/theme.ts`)도 같은 값으로 구성한다. UI 문구는 `src/ui/copy.ts`가 단일 소스다. **컴포넌트·CSS에 값/문구를 직접 쓰지 않는다.**
- **초기 번들 경계**: 정적 텍스트·레이아웃은 **시맨틱 HTML + 토큰 CSS**로 렌더해 UI 라이브러리를 초기 번들에 넣지 않는다. AntD 6는 상호작용 컴포넌트가 있는 화면(#4)부터 사용하고, 필요 시 **라우트 단위 코드 분할**로 초기 번들에서 제외한다.
- **예외(폰트 경로)**: 외부 URL은 없다 — KoddiUD 파일 경로는 `src/ui/display-font.css`의 `@font-face`에서만, Inter는 `@fontsource-variable/inter` 패키지에서만 직접 참조한다.
- **품질**: Lighthouse(모바일 기본) 4개 카테고리 **≥90**을 목표로 하고, 미달 시 원인·후속을 PR/이슈에 기록한다.

## 결과
- 긍정: 일관된 UI, 값 변경이 한 곳에서 반영, 접근성·성능 기준이 명시됨.
- 부정/제약: CSS 변수 주입이 JS 실행에 의존(SPA 전제라 허용 — 최초 페인트 전에 주입). 디스플레이 폰트는 로드 완료 전까지 폴백(Inter/시스템)으로 표시된다.

## 대안과 금지 사항
- Tailwind 등 별도 스타일 시스템 도입 — AntD 6 테마로 충분(범위 밖, ADR-0002).
- hover 효과·장식 색·absolute 배치·문구/수치 하드코딩 — 금지.

## 참고
- 이슈 #34, #1, #4 / `frontend-responsive-ui` 스킬 / Lighthouse / 눈누 폰트 #674(KoddiUD 온고딕)
