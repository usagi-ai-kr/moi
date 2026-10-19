---
id: ADR-0029
title: 공개 라이선스 페이지와 생성물 제공
status: Proposed
date: 2026-10-19
related:
  - ADR-0001
  - ADR-0011
  - ADR-0026
---

# ADR-0029: 공개 라이선스 페이지와 생성물 제공

## 배경
- 이슈 #121: 기술 산출물로 THIRD_PARTY_NOTICES.md에서 생성한 production 의존성 95개(버전별 행) 고지를 로그인 없이 `/licenses`에서 읽을 수 있게 한다.
- 기존 SPA에는 라우터가 없었다(`bootstrap/web/main.tsx`는 App 단일 렌더). 홈 화면은 `App` 세션 hooks(`/api/me`)에 결합되어 있어 로그인·세션 오류가 공개 열람을 막는 구조였다.
- 생성물은 `scripts/generate-third-party-notices.mjs`가 결정적으로 생성하며 저작권 미확인 4건은 원문 그대로 '확인 필요' 표기를 유지해야 한다(법률 승인·완전 검증을 주장하는 표현 금지).

## 결정
- `bootstrap/web`에 react-router(이미 설치) `BrowserRouter` + `Routes`의 **최소 경계**를 둔다(routes.tsx). `/licenses` → lazy `LicensePage`, `*`(기존 모든 URL·콜백 query 포함) → 기존 `App`으로 회귀한다.
- `/licenses`는 `App` 세션 hooks 밖에 둔다 — `QueryClient`/`apiClient`는 공유하되 라우트가 App을 마운트하지 않으므로 세션 네트워크 오류가 고지 열람을 막지 않는다.
- **생성 고지는 JS에 인라인하지 않고 `?url` 정적자산(빌드 시 해시 자산)으로만 배포한다.** `?raw` 인라인 시 서버 코드 흔적(drizzle-orm·paseto-ts 등 의존성 이름 문자열)이 번들 일부가 되어 `check-browser-bundle.mjs`가 서버 유출로 거부한다(빌드 게이트 fail-closed). 검사 약화·문자열 인코딩 우회는 금지.
- 런타임에 기존 same-origin Ky client(`createApiClient`의 get)로 자산을 읽는 **정적 고지 로더** `src/ui/api/licenses.ts`를 둔다. 로더는 fail-closed guard를 갖는다: 빈 본문·SPA fallback HTML(200)·파싱 0건을 오류로 처리하고, 5셀 외 표행은 파싱에서 throw한다. 화면은 `useQuery`(로딩/오류/재시도 문구, TanStack Query)로 상태 처리하고 세션(`/api/me`)과 무관하게 공개 열람을 유지한다.
- `parseNotices`는 외부입력 없는 순수 함수로 유지하고, JSX 텍스트 노드로만 렌더해 HTML 주입을 금지한다. 수동 95행 복제 금지.
- 전체 원문은 다운로드 링크(정적자산 `noticesAssetUrl`)로 제공한다. 페이지 본문에는 건수·미확인 상태만 간결 표시하고, 생성 스크립트 명령·내부 규칙 등 provenance 전문은 노출하지 않는다.
- `LicensePage`는 lazy 청크로 분리해 홈 초기 번들에 고지 관련 로직을 넣지 않는다(푸터 링크 스타일만 App이 licenses.css를 임포트). `check-browser-bundle`에 따라 고지 데이터는 별도 자산 청크다.
- 홈 `App`에는 푸터 라이선스 링크만 추가한다(useStudyFlow 등 학습 흐름 수정 금지).

## 결과
- 긍정: 로그인 없이 실제 95개 고지 열람, 직접 URL/새로고침/홈 복귀 동작, 생성물-페이지 단일 원천 유지(비동기 drift 없음), 고지 데이터가 별도 자산으로 배포되어 홈 번들·브라우저 번들 검사 모두 통과.
- 부정/제약: 자산 로딩 실패 시(빈 본문/HTML fallback/네트워크) 오류·재시도 화면이 보인다 — 공개 열람은 서버 자산 응답에 의존한다. `parseNotices`는 5셀 표 형식을 고정 요구하므로 생성기 출력 형식 변경 시 최초 실패로 드러난다. meta/SEO/라우팅 전면개편(#72)은 아니므로 깊은 경로 구조·SEO 대응은 남는다. 라우터가 초기 번들에 편입된다(경계 최소화로 상쇄).

## 대안과 금지 사항
- 고지 목록을 별도 JSON/파일로 복제하는 대안: 원문과의 복제·drift를 만드므로 금지.
- `?raw` 인라인 유지 + 검사기 우회(문자열 인코딩·regex 완화) 대안: 빌드 게이트의 서버 유출 방어를 감추므로 금지 — 자산 배포로 문제를 제거했다.
- provenance(스크립트 명령·내부 규칙) 전문을 페이지에 노출하는 대안: 독자에게 불필요한 내부 정보 노출이므로 다운로드 원문으로 유지.
- 페이지에 '모든 고지 완료/법률 승인' 표현 추가: 미확인 4건을 숨기거나 검증을 과장하는 표현이므로 금지.
- Remote MDX/HTML 렌더: XSS·주입 위험이므로 금지(텍스트 노드만).

## 참고
- 이슈 #121, ADR-0012(단일 소스), ADR-0011(브라우저 번들 경계), ADR-0026(정적 자산/단일 Worker 배포).
