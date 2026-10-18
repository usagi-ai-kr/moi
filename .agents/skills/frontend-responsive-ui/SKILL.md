---
name: frontend-responsive-ui
description: React SPA + Ant Design 6 반응형 UI 구현 규칙. 로그인·로딩·취소·오류·로그아웃 화면 구현, viewport(320~1280) 대응, 접근성(키보드 포커스/터치 타깃), TanStack Query·Zustand·Ky 상태 관리 판단 시 사용.
compatibility: Node.js와 playwright 필요 — playwright는 프로젝트 devDependency (scripts/check-viewport-overflow.mjs).
---

# 반응형 프론트엔드 — React + Ant Design 6

출처: 이슈 #1(반응형 품질 기준, 라이브러리 책임), #4(화면·상태 설계). 관련: `architecture-boundaries`, `tdd-bdd-testing`.

## 스크립트 (우선 실행 — repo root에서 실행)
- `node .agents/skills/frontend-responsive-ui/scripts/check-viewport-overflow.mjs <base-url> [route ...]` — 320/375/768/1024/1280px에서 **가로 오버플로만** 검사(playwright 필요, 0.1.0 scaffold 이후). 겹침·클릭 가능·포커스·가시성은 Playwright 시나리오가 검증(#12). 위반 시 exit 1, 항목별 한 줄 요약.

## 반응형 기준 (Mobile-first)
- 브레이크포인트: 모바일 320–767px / 태블릿 768–1199px / 데스크탑 1200px 이상.
- AntD 6 `Grid`/`Flex`/`ConfigProvider` token 사용. 한 화면에서 viewport별 레이아웃을 조절한다.
- 검증 viewport: **320 / 375 / 768 / 1024 / 1280px** — 로그인·로그아웃·오류 화면에서 가로 스크롤/겹침 없음.
- 접근성: 키보드 포커스, 접근 가능한 버튼 명칭, 터치 타깃 크기, 로딩/에러 상태 표시 포함.

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

## 테스트
- React Testing Library로 UI 상태·오류 처리 단위 테스트.
- Playwright-BDD로 핵심 화면 320/375/768/1024/1280 전부, 보조 시나리오 375/768/1280 실행.
- 반응형 판정 분리(ADR-0011): 가로 오버플로 도구의 통과는 **반응형 전체 통과가 아니다**. 핵심 화면 5종에서 주요 요소 가시성·클릭 가능·포커스 순서·스크린샷 비교는 Playwright 시나리오가 담당한다(#12).
- 상태 소유권 테스트: TanStack Query가 진실 원천이고, Zustand에 토큰/중복 사용자 상태가 없음을 검증.
