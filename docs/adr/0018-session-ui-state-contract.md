---
id: ADR-0018
title: 세션·UI 상태 계약 — 서버 진실 원천과 캐시 규칙
status: Accepted
date: 2026-10-18
related: ["#4", "ADR-0005", "ADR-0006", "ADR-0012", "ADR-0014"]
---

# ADR-0018: 세션·UI 상태 계약 — 서버 진실 원천과 캐시 규칙

## 배경
- 0.1.3(#4) UI는 백엔드와 독립적으로 `/api/me` 모의 계약으로 먼저 구현한다. 브라우저에 토큰을 두지 않고 서버를 진실 원천으로 삼는 규칙을 고정한다.

## 결정
- `GET /api/me` → 200 `{user:{id}}` · 401 `{error:"unauthorized"}` · 항상 `Cache-Control: no-store`. 401은 오류가 아니라 **비로그인(null)** 으로 매핑한다.
- `POST /auth/logout` → 성공 204(+쿠키 삭제) · CSRF 실패 403 · 미인증 401.
- 카카오 callback 최종: 성공 `302 /?auth=success`, 실패/취소 `302 /?auth=error`. UI는 진입 시 `auth` 파라미터를 `history.replaceState`로 정리한다(원문 오류·토큰 노출 금지).
- TanStack Query 키 `['me']`가 세션의 진실 원천. 로그인 성공·로그아웃 후 `invalidateQueries` + `removeQueries`.
- Zustand는 배너 닫기·로그아웃 진행 표시 등 **일시 UI 상태만** — 사용자 객체·토큰 저장 금지.
- Ky 단일 클라이언트(`src/ui/api/client.ts`)에 `getMe`·`logout`을 모은다. 컴포넌트에서 fetch 직접 호출 금지.
- **로그인 화면 렌더링(ADR-0012/0014 범위 내 예외)**: 로그인·로딩·취소·오류·로그아웃처럼 LCP가 중요한 소형 화면은 **경량 시맨틱 HTML/CSS**로 렌더하고, AntD 6은 모달·폼·테이블 등 복잡한 상호작용 화면에 사용한다. 확정 스택(AntD 6)은 유지하되 초기 번들에서 제외한다. 근거: 번들 624KB→295KB(gzip −54%), 모바일 Lighthouse 홈/오류 90/100/96/100·로그인 90/94/100/100, RTL·BDD·viewport 5종 유지. 사용자 승인(2026-10-18).

## 결과
- 긍정: 저장소 무토큰(보안)·401 정상 흐름·캐시 일관성.
- 부정/제약: `?auth=` 일회성 파라미터라 진입 판정은 마운트 시 래치한다.

## 대안과 금지 사항
- localStorage/sessionStorage에 PASETO·앱 토큰 저장 — 금지(ADR-0005/0006 유지).
- 401을 오류 화면으로 처리 — 채택하지 않음(비로그인 홈이 정상).

## 참고
- 이슈 #4 / `frontend-responsive-ui`·`session-paseto` 스킬
