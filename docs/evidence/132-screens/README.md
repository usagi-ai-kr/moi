# 핵심 화면 Viewport 증거 (#132 / #148)

- **기준 커밋 SHA**: `e50fe5d1c73f3a33900f4856b2f2a0096b386fcb` (`e50fe5d`, #194 병합 후 dev)
- **측정 방식**: 로컬 `pnpm build` + `vite preview` + Playwright 결정적 Route Mock (`scripts/capture-screens.mjs`). **실계정·배포 환경 검증이 아닌 로컬 mock 증거**이며, 실제 Kakao 로그인·D1·Worker API는 호출하지 않는다.
- **측정 일시**: 2026-10-20 14:09 KST (`results.json.generatedAt` = `2026-10-20T05:09:59.580Z`)
- **측정 뷰포트**: 320 / 375 / 768 / 1024 / 1280px (높이 800px, full-page 캡처)
- **재현**: `node scripts/capture-screens.mjs` (현재 HEAD를 빌드한 뒤 촬영. 빌드 생략 시 `--no-build`)
- **Lighthouse**: 이번 증거에서는 측정하지 않는다. 배포 URL 측정은 #132 댓글·#146 참고.

> #184~#194의 최종 UI(10문제 문구·상단 제출/포기·결과 페이저·근거 문서명)를 반영한 캡처다. 풀이 중은 `/study`, 결과는 `/study/new`에서 시작→답안→제출 후 `/study/result`로 이동해 촬영했다. `/study/:setId`·`/study/:setId/result`는 레거시 호환 리다이렉트다.

---

## 1. 화면별 뷰포트 스크린샷 및 측정 결과

| 화면 ID | 화면명 | 경로 | 320px | 375px | 768px | 1024px | 1280px | 최소 버튼 높이 | 가로 넘침 | 원시값 노출 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `home-logged-out` | 로그아웃 홈 | `/` | [320px](./home-logged-out-320.png) | [375px](./home-logged-out-375.png) | [768px](./home-logged-out-768.png) | [1024px](./home-logged-out-1024.png) | [1280px](./home-logged-out-1280.png) | 46px (카카오) | 없음 (0px) | 없음 |
| `home` | 홈(로그인 후) | `/` | [320px](./home-320.png) | [375px](./home-375.png) | [768px](./home-768.png) | [1024px](./home-1024.png) | [1280px](./home-1280.png) | 40px | 없음 (0px) | 없음 |
| `study-new` | 학습 시작 | `/study/new` | [320px](./study-new-320.png) | [375px](./study-new-375.png) | [768px](./study-new-768.png) | [1024px](./study-new-1024.png) | [1280px](./study-new-1280.png) | 40px | 없음 (0px) | 없음 |
| `study-active` | 풀이 중 | `/study` | [320px](./study-active-320.png) | [375px](./study-active-375.png) | [768px](./study-active-768.png) | [1024px](./study-active-1024.png) | [1280px](./study-active-1280.png) | 44px | 없음 (0px) | 없음 |
| `study-result` | 결과(해설 포함) | `/study/result` (진입 `/study/new`) | [320px](./study-result-320.png) | [375px](./study-result-375.png) | [768px](./study-result-768.png) | [1024px](./study-result-1024.png) | [1280px](./study-result-1280.png) | 44px | 없음 (0px) | 없음 |
| `history-empty` | 이력(0건) | `/history` | [320px](./history-empty-320.png) | [375px](./history-empty-375.png) | [768px](./history-empty-768.png) | [1024px](./history-empty-1024.png) | [1280px](./history-empty-1280.png) | N/A (버튼 없음) | 없음 (0px) | 없음 |
| `history-populated` | 이력(다건, 상세 펼침) | `/history` | [320px](./history-populated-320.png) | [375px](./history-populated-375.png) | [768px](./history-populated-768.png) | [1024px](./history-populated-1024.png) | [1280px](./history-populated-1280.png) | 64px | 없음 (0px) | 없음 |
| `review` | 복습(채점 후 진행) | `/review` | [320px](./review-320.png) | [375px](./review-375.png) | [768px](./review-768.png) | [1024px](./review-1024.png) | [1280px](./review-1280.png) | 44px | 없음 (0px) | 없음 |
| `account` | 계정 | `/account` | [320px](./account-320.png) | [375px](./account-375.png) | [768px](./account-768.png) | [1024px](./account-1024.png) | [1280px](./account-1280.png) | 44px | 없음 (0px) | 없음 |

상세 측정 데이터 원본: [`results.json`](./results.json)

### 최종 확인 항목 (#132·#176)

| 항목 | 증거 | 판정 |
| --- | --- | --- |
| 10문제 문구 | 홈 `10문제 학습`, 학습 시작 `AWS SAA-C03 · 10문제`, 범위 3종 모두 `10문제` | 확인 |
| 학습 시작/이력 같은 줄 | `study-new-320~1280.png` — 두 버튼이 같은 행 | 확인 |
| 상단 제출/포기 | `study-active-320~1280.png` — 진행 표시 아래 상단에 `제출하기`·`포기하기` | 확인 |
| 복습 버튼 테두리 | `review-320~1280.png` — `복습 종료` 보조 버튼 테두리 표시 | 확인 |
| 영역별 카드 | `history-empty/populated-*.png` — `영역별 현황`의 보안·비용 최적화 카드 | 확인 |
| 계정 섹션 | `account-*.png` — 계정 페이지·로그아웃 | 확인 |
| 결과 페이저 | 캡처 `study-result-*.png`는 fixture 3문항 기준 **`1/3`**. 제품 10문항 계약의 **`1/10`**은 BDD `study.feature`에서 확인했으며, 이 캡처를 `1/10` 증거로 사용하지 않는다. | 캡처=1/3, 계약=1/10 (BDD) — 아래 한계 1 |
| 근거 문서명 | 결과 `Vpc endpoints s3`, 복습 `What is vpc peering` (`공식 근거`/`근거` 링크) | 확인 |
| 가로 넘침 | 45개 캡처 전체 `scrollWidth - clientWidth = 0px` | 확인 |
| 원시값 노출 | UUID·`opt-*`·소문자 `saa-c03`·`dom-*` 0건 | 확인 |

> **캡처 분모 주의**: `study-result-*.png`의 `1/3`은 캡처 fixture(3문항)의 분모다. 신규 10문항 계약(ADR-0046)의 `1/10`과 다르며, 이 스크린샷을 1/10 증거로 인용하지 않는다. 10문항 스크린샷은 미확보(후속).

### 측정 정의

- **가로 넘침**: `document.documentElement.scrollWidth - clientWidth` (px). 45개 캡처 전체 0px.
- **최소 버튼 높이**: 화면에 보이는 `button`, `[data-slot="button"]`, `a[role="button"]`, `input[type=button|submit]`, `.moi-kakao-login` 중 최소 높이. 내비게이션 텍스트 링크는 제외했다.
- **원시값 노출**: `body.innerText`에서 UUID, `opt-*`, 소문자 `saa-c03`, `dom-*` 검사. 사용자 라벨 `AWS SAA-C03`는 대소문자를 구분해 위반으로 잡지 않는다.

### 결과 요약

- 9개 화면 × 5개 뷰포트 = **45개 캡처**
- 가로 넘침: **0건**
- 44px 미만 버튼: **20건** — 홈·학습 시작의 `10문제 학습`/`학습 이력`/`학습 시작` 버튼이 40px (각 화면·뷰포트 2개)
- UUID·`opt-`·`saa-c03`·`dom-` 원시값 노출: **0건**
- 결과 요약은 320px에서 2×2, 768px 이상에서 4열 통계 그리드로 표시된다(#162).
- 결과 해설은 #194에서 한 문항씩 좌우 페이징으로 표시된다. 10문항 세트의 `1/10` 진행 표시는 `pnpm test:bdd`의 `결과 화면 해설 좌우 페이징` 시나리오(41개 중 1개)에서 확인했다.

---

## 2. 남은 문제 / 이번 증거의 한계

| # | 항목 | 내용 | 후속 |
| --- | --- | --- | --- |
| 1 | 캡처 분모 3문항 | 캡처 스크립트의 학습 세트 mock이 3문항이라 결과 스크린샷은 `1/3`로 표시된다. 10문항 계약의 `1/10`은 BDD `study.feature`에서 확인했지만, 스크린샷으로는 10문항 페이저를 확인할 수 없다. | `scripts/capture-screens.mjs` fixture 10문항 확장(이번 단위 소유 밖, 후속) |
| 2 | 44px 미만 터치 타깃 | 홈·학습 시작의 주요 버튼이 40px로, 45개 캡처 중 20건이 44px 미만이다. | 디자인 계약 기준 판단·후속 수정 |
| 3 | API 오류 상태 미촬영 | 북마크·답안 저장·통계 API를 모두 200으로 mock해 `다시 시도` 오류 UI가 캡처되지 않았다. | 오류 상태 전용 캡처·터치 타깃 점검 |
| 4 | 실계정·배포 검증 아님 | 로컬 결정적 mock이며 Kakao 로그인·D1·Worker·CDN 환경을 검증하지 않는다. | 배포 smoke(#131/#146) |
| 5 | Lighthouse 미측정 | 이번 캡처는 시각 증거만 다룬다. | 배포 URL Lighthouse 기록(#146) |
| 6 | 콘텐츠 규모 제한 | 결과 화면은 3문항 mock이다. 10문항·긴 해설·표/코드/Mermaid가 섞인 실제 세트의 페이지 길이·스크롤 성능은 다를 수 있다. | 실제 세트 기반 캡처 |
| 7 | 정정 반영 상태 미촬영 | 결과 화면의 정정 이력 패널은 `corrections: []` mock이라 노출되지 않았다. | 정정 데이터 포함 캡처 |

**최소 변경안(소유 밖, 이번 단위 미수행)**: `scripts/capture-screens.mjs`의 `STUDY_ITEMS`(3개)를 10개로 확장하거나 `makeActiveSet({ count })`로 파라미터화해 결과 캡처만 10문항 fixture를 사용한다. 제품 코드·API 계약 변경은 필요 없다. 이번 단위에서는 소유 범위를 지켜 수정하지 않았다.

---

## 3. 변경 요약

- `results.json`: 기준 커밋을 `e50fe5d`로 갱신하고 45개 캡처 측정값을 다시 기록했다.
- 스크린샷: 9개 화면 × 5개 뷰포트를 재생성했다. #194에서 갱신된 결과 화면을 포함하며, 나머지 화면은 직전 커밋과 동일한 렌더링이다.
- `scripts/capture-screens.mjs`·제품 소스는 수정하지 않았다.
