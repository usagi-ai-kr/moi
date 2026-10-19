---
name: frontend-responsive-ui
description: React SPA 디자인 계약·shadcn/ui/Tailwind 전환·반응형 UI 검토 규칙(AWS 팔레트·KoddiUD 온고딕/Inter·Lighthouse). 로그인·로딩·취소·오류·로그아웃 화면 구현, viewport(320~1280) 대응, 접근성(키보드 포커스/터치 타깃), TanStack Query·Zustand·Ky 상태 관리 판단 시 사용.
compatibility: Node.js와 playwright 필요 — playwright는 프로젝트 devDependency (scripts/check-viewport-overflow.mjs).
---

# 반응형 프론트엔드 — 제품 디자인 계약 및 단계적 UI 전환

출처: 이슈 #1(반응형 품질 기준, 라이브러리 책임), #4(화면·상태 설계). 관련: `architecture-boundaries`, `tdd-bdd-testing`.

## 최우선 디자인 계약
- **루트 `DESIGN.md`를 먼저 읽고** #148의 화면·메뉴 분리, UUID 비노출, 폰트·버튼, 결과 상세/이력 페이지네이션, Skeleton·pending·empty·error, GitHub Primer급 아이콘 시인성을 수용 기준으로 사용한다.
- 목표 UI 스택은 **shadcn/ui + Tailwind CSS**. 현행 AntD 규칙은 **마이그레이션 전 기존 코드 설명**이지 새 화면의 최종 가이드가 아니다. 확정 ADR 및 AGENTS·스킬 동기화 후 기존 AntD를 제거한다.
- Lighthouse ≥90·viewport overflow 통과만으로 UI 승인 금지. 실제 before/after 스크린샷·키보드·타이포·시각적 위계·사용자 확인 필수.

## 스크립트 (우선 실행 — repo root에서 실행)
- `node .agents/skills/frontend-responsive-ui/scripts/audit-design-contract.mjs` — DESIGN.md의 필수 계약/벤치마크 3개 이상 및 스킬 연결을 정적으로 검사한다. **구현의 시각 품질 판정을 대체하지 않는다.**
- `node .agents/skills/frontend-responsive-ui/scripts/check-viewport-overflow.mjs <base-url> [route ...]` — 320/375/768/1024/1280px에서 **가로 오버플로만** 검사(playwright 필요, 0.1.0 scaffold 이후). 겹침·클릭 가능·포커스·가시성은 Playwright 시나리오가 검증(#12). 위반 시 exit 1, 항목별 한 줄 요약.
- `node .agents/skills/frontend-responsive-ui/scripts/run-lighthouse.mjs [url] [--desktop] [--runs N] [--min 90]` — Lighthouse 4개 카테고리 측정·판정(ADR-0014). URL 생략 시 빌드+preview 자동 기동, 미달 시 exit 1.

## 반응형 기준 (Mobile-first)
- 브레이크포인트: 모바일 320–767px / 태블릿 768–1199px / 데스크탑 1200px 이상.
- AntD 6 `Grid`/`Flex`/`ConfigProvider` token 사용. 한 화면에서 viewport별 레이아웃을 조절한다.
- 검증 viewport: **320 / 375 / 768 / 1024 / 1280px** — 로그인·로그아웃·오류 화면에서 가로 스크롤/겹침 없음.
- 접근성: 키보드 포커스, 접근 가능한 버튼 명칭, 터치 타깃 크기, 로딩/에러 상태 표시 포함.

## 디자인 시스템 (ADR-0012·0014)
- 팔레트: **AWS Orange(`#FF9900`) 액센트 + 무채색**(AWS Squid Ink 계열). 장식적 색 금지. (예외: 카카오 브랜드 버튼 — 공식 가이드 색)
- 서체: 표시(브랜드/제목)=**KoddiUD 온고딕**, UI 텍스트=**Inter 계열**. KoddiUD는 **공식 웹폰트 경로**(눈누 제공 jsdelivr·저장소 미포함·형태 그대로)를 첫 페인트 이후 지연 주입 — `preload`·임계 경로 편입 금지. 주입 `@font-face`는 `font-display:optional` + 지연 주입으로 LCP 안정화(첫 로드 폴백·캐시 후 적용, ADR-0022).
- 레이아웃: **container 내부 padding + flex/grid gap**으로 간격·충돌 방지, **overflow 지양**, position은 기본 fixed — **모달/드롭다운/툴팁 등 필요한 배치는 예외 허용**(사유 기록).
- 여백 가드레일: 요소·경계(테두리·화면단)에 붙이지 않는다 — 요소 간 최소 8px, 화면단 최소 `clamp(16px,5vw,32px)`, **페이지 기본 패딩 축소 금지**.
- 모션: ≤320ms 트랜지션·진입 애니메이션 허용, `prefers-reduced-motion` 존중. **hover 전용 의존 UX 금지**(호버는 보조 강화만 — 키보드 `focus-visible`·터치 동등 동작 보장).
- **중앙 관리(하드코딩 금지)**: 색·박스모델·타이포·모션 = `src/ui/tokens.ts` → CSS 변수(`var(--moi-*)`)와 AntD 테마 동시 적용, 문구 = `src/ui/copy.ts`. 컴포넌트/CSS에 값·문구를 직접 쓰지 않는다. (예외: 폰트 URL — `tokens.ts`의 `typography.displayFontUrl`만)
- **초기 번들 규칙**: 정적 텍스트·레이아웃은 시맨틱 HTML+토큰 CSS로 렌더하고 UI 라이브러리를 초기 번들에 넣지 않는다. AntD는 상호작용 화면부터, 무거운 화면은 라우트 단위 코드 분할로 지연 로드. 디스플레이 폰트는 `load`+1.2s 지연·`<style>` 주입. 로그인·로딩·취소·오류·로그아웃처럼 LCP가 중요한 소형 화면은 경량 시맨틱 HTML/CSS로 구현하고, AntD 6은 모달·폼·테이블 등 복잡한 상호작용에 사용한다(ADR-0018).
- **카카오 로그인 버튼**(`KakaoLoginButton`, `/auth/kakao`): 공식 가이드 필수 — 컨테이너 `#FEE500`·말풍선 **심볼 `#000000`**(형태·비율·색 변경·심볼 생략 금지)·레이블 `#000 85%`·시스템 서체·radius 12px. 값은 `tokens.ts`의 `kakao`.
- Lighthouse(모바일 기본) 4개 카테고리 ≥90 — `run-lighthouse.mjs`로 재현 실행하고 결과를 PR에 기록.

## 상태 소유권 (위반 금지)
- 사용자 인증 상태의 진실 원천은 **서버**(`/api/me`). TanStack Query가 캐시·재검증·무효화 담당.
- Zustand에는 토스트·대화상자·화면 단계 등 일시적 UI 상태만. **로그인 상태·토큰 저장 금지.**
- 브라우저에 PASETO 원문을 노출하거나 localStorage/sessionStorage에 저장 금지.
- Ky는 단일 same-origin 클라이언트로만 사용(credentials, timeout, AbortSignal, 표준화된 오류). 401 수신 시 TanStack Query 캐시 재검증/리셋. 컴포넌트에서 fetch/ky 직접 분산 호출 금지.
- login/logout 후 `/api/me` 관련 캐시 invalidate/remove.
- 데이터 경로 유지: 컴포넌트 → query/usecase facade → Ky client → Hono middleware → app usecase → Domain/Port.

## 화면 체크리스트 (0.1.3 범위)
- [ ] 로그인 시작 화면(버튼)
- [ ] 로딩 상태
- [ ] 사용자 취소/카카오 장애 시 안전한 오류 화면 (원문 토큰·내부 오류 노출 금지)
- [ ] 로그인 완료 후 SPA 라우팅 연동 + 새로고침 시 로그인 상태 복구
- [ ] 로그아웃 화면/동작
- [ ] 5개 viewport에서 잘림/가로 스크롤/겹침 없음
- [ ] 키보드 포커스·버튼 명칭·터치 타깃·로딩/오류 상태 확인
- [ ] 카카오 로그인 버튼: 공식 심볼·#FEE500·radius 12px 규정 준수
- [ ] 요소·경계(테두리·화면단)에 붙지 않음 — 페이지 기본 패딩 유지
- [ ] hover 비의존 · 문구(`copy.ts`)·수치(`tokens.ts`) 하드코딩 없음
- [ ] Lighthouse(모바일) 4개 카테고리 ≥90 — `run-lighthouse.mjs` 결과를 PR에 기록

## 테스트
- React Testing Library로 UI 상태·오류 처리 단위 테스트.
- Playwright-BDD로 핵심 화면 320/375/768/1024/1280 전부, 보조 시나리오 375/768/1280 실행.
- 반응형 판정 분리(ADR-0011): 가로 오버플로 도구의 통과는 **반응형 전체 통과가 아니다**. 핵심 화면 5종에서 주요 요소 가시성·클릭 가능·포커스 순서·스크린샷 비교는 Playwright 시나리오가 담당한다(#12).
- 상태 소유권 테스트: TanStack Query가 진실 원천이고, Zustand에 토큰/중복 사용자 상태가 없음을 검증.
