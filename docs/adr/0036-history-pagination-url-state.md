---
id: ADR-0036
title: 이력 페이지 URL 상태와 비동기 조회 UX
status: Accepted
date: 2026-10-19
related: ["#148", "PR #151", "ADR-0035"]
---

# ADR-0036: 이력 페이지 URL 상태와 비동기 조회 UX

## 배경
- PR #151 화면 분리 이후 페이지 번호가 로컬 컴포넌트 상태로 관리되어 뒤로가기·새로고침 시 위치가 소실되었다.
- 비동기 재조회 중 목록 깜빡임(사라짐), 0건·1페이지 시의 불필요한 pager 노출 등 조회 UX 결함이 발생했다.

## 결정
- **URL 단일 기준**: `?page=N`(`useSearchParams`)을 진실 원천으로 삼고, 중앙 상수 `pageSize=20`을 적용한다.
- **파라미터 정규화**: safe 정수 검증을 거치며 범위 초과는 서버 확정 응답 후 replace 정정하고, 기존 param을 보존한다.
- **탐색 UX**: 사용자 이동은 push로 back/forward를 보존하며, `keepPreviousData` 및 로딩 중 disabled/`aria-busy`를 적용한다.
- **목록·스타일 계약**: 0건은 nav 숨김, 1페이지는 total만 표시한다. 실패 시 재시도와 상세 격리를 제공한다.
- **독립 뷰 로딩**: `HistoryView`가 필요 CSS를 직접 로드하고, `baseSize` 토큰 기반 16px 글꼴과 44px 이상 터치 타깃을 보장한다.
- **범위 한정**: UUID 주소 제거, 인증 복귀 연계, 복습 흐름, 전체 UI 완결은 후속 과제이며 본 결정 범위로 간주하지 않는다.

## 결과
- 긍정: URL 공유·브라우저 탐색 지원, 로컬 7게이트(unit/UI 433, Worker 178, BDD 28 pass) 및 5 viewport 실제 검증 통과.
- 부정/제약: 단위 검증 완료 증거일 뿐 실계정/원격 배포 검증은 아니며, 후속 UI 과제는 별도 단계로 완결해야 한다.

## 대안과 금지 사항
- 로컬 React state 전용 페이징 금지. 클라이언트 추측 기반 URL 강제 변경 금지(서버 totalPages 확정치로만 replace).

## 참고
- #148, PR #151, `tests/ui/history-pagination.test.tsx` (20건 검증), ADR-0035.
