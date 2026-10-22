# 핵심 화면 Viewport 증거 (#132 / #148)

- **캡처 기준 커밋**: `14f331ec2b5df6df1354cf51ec40a1338171c872` (`14f331e`, 현행 any-pointer:coarse 계약·answerCount 정합 기록; 제품 코드 변경 없음)
- **측정 방식**: 로컬 `pnpm build` + `vite preview` + Playwright 결정적 Route Mock (`scripts/capture-screens.mjs`). **실계정·배포 환경 검증이 아닌 로컬 mock 증거(에뮬레이션)**이며, 실제 Kakao 로그인·D1·Worker API는 호출하지 않는다. 모바일 폭(320/375/768)은 `hasTouch+isMobile` 터치 컨텍스트로 `any-pointer:coarse`를 매칭하고, `pointer:coarse`·`any-pointer:coarse` 둘다+`hasTouch`·`maxTouchPoints`·focus 도달 가능 수를 함께 기록한다. 현행 계약은 `any-pointer:coarse`(ADR-0050)이며, `pointer:coarse`는 과거 표기 비교용으로만 둔다. 과거 증거의 coarse=모바일 에뮬레이션이며 하이브리드(주 fine+any coarse) 실측이 아니다. iOS/Android 실기기로 성공 표시 금지.
- **측정 일시**: 2026-10-20 18:54 KST (`results.json.generatedAt` = `2026-10-20T09:54:15.043Z`)
- **측정 뷰포트**: 320 / 375 / 768 / 1024 / 1280px (높이 800px, full-page 캡처)
- **재현**: `node scripts/capture-screens.mjs` (현재 HEAD를 빌드한 뒤 촬영. 빌드 생략 시 `--no-build`)
- **Lighthouse**: 이번 증거에서는 측정하지 않는다. 배포 URL 측정은 #132 댓글·#146 참고.

> #184~#194의 최종 UI(10문제 문구·상단 제출/포기·결과 페이저·근거 문서명)를 반영한 캡처다. 캡처 fixture는 기존 대표 3문항을 유지하고 7문항을 추가한 총 10문항이다. 제출 전 DTO는 ADR-0049·`routes.ts:79` 정합으로 `answerCount=correctOptionIds.length`(정답 ID 비노출)를 포함한다 — 단일 9문항+복수 1문항(q-mock-2, 2개)으로 최소 단일·복수 안내를 DTO에 포함하고, 화면에는 첫 문항 단일 안내(`정답 1개를 고르세요`)를 촬영한다. 1 폴백·undefined 안내를 촬영하지 않는다. 풀이 중은 `/study`, 결과는 `/study/new`에서 시작→답안→제출 후 `/study/result`로 이동해 촬영했다. `/study/:setId`·`/study/:setId/result`는 레거시 호환 리다이렉트다.

---

## 1. 화면별 뷰포트 스크린샷 및 측정 결과

| 화면 ID | 화면명 | 경로 | 320px | 375px | 768px | 1024px | 1280px | 최소 버튼 높이 | 가로 넘침 | 원시값 노출 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `home-logged-out` | 로그아웃 홈 | `/` | [320px](./home-logged-out-320.png) | [375px](./home-logged-out-375.png) | [768px](./home-logged-out-768.png) | [1024px](./home-logged-out-1024.png) | [1280px](./home-logged-out-1280.png) | 46px (카카오) | 없음 (0px) | 없음 |
| `home` | 홈(로그인 후) | `/` | [320px](./home-320.png) | [375px](./home-375.png) | [768px](./home-768.png) | [1024px](./home-1024.png) | [1280px](./home-1280.png) | 40px(터치 없음 데스크톱) / any-touch 44px | 없음 (0px) | 없음 |
| `study-new` | 학습 시작 | `/study/new` | [320px](./study-new-320.png) | [375px](./study-new-375.png) | [768px](./study-new-768.png) | [1024px](./study-new-1024.png) | [1280px](./study-new-1280.png) | 40px(터치 없음 데스크톱) / any-touch 44px | 없음 (0px) | 없음 |
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
| 결과 페이저 | `study-result-320/375/768/1024/1280.png` 5종에서 **`1/10`** 확인. 요약도 `정답 1/10·답변 1·Pass 1·미응답 8` | 확인 |
| 근거 문서명 | 결과 `Vpc endpoints s3`, 복습 `What is vpc peering` (`공식 근거`/`근거` 링크) | 확인 |
| 가로 넘침 | 45개 캡처 전체 `scrollWidth - clientWidth = 0px` | 확인 |
| 원시값 노출 | UUID·`opt-*`·소문자 `saa-c03`·`dom-*` 0건 | 확인 |
| 정답 개수 안내 | 풀이 첫 문항 단일 안내 `정답 1개를 고르세요` 촬영, DTO에 단일 9+복수 1(q-mock-2, `answerCount=2`) 포함·정답 ID 비노출. 복수 힌트는 단위 테스트(`tests/ui/answer-count.test.tsx`)로 확인 | 확인 |
| 결과 문항 목록 | 10문항 목록·페이저·긴 AWS stem/URL 줄바꿈, 넘침 0px와 함께 촬영 | 확인 |
| 포인터 계약 | 320/375/768 `any-pointer:coarse=true`·`hasTouch=true`, 1024/1280 `any-pointer:coarse=false`·`hasTouch=false`. `pointer:coarse`는 비교용 병기 | 확인 |
| 포커스·터치 조작 | 보이는 버튼 포커스 도달 가능(예: 풀이 7/8·결과 17/18, 비활성 제외·`tabindex=-1` 0). any-touch 44px, 터치 없음 40px | 확인 |

> **BDD 표현 정정**: `e2e/steps/study.steps.ts:455`는 position 변수와 `\d+`로 만든 정규식으로 위치만 확인하며 `1/10`을 직접 단언하지 않는다. 10문항 fixture에서 실행될 뿐이므로, 1/10 증거는 이번 캡처 5종이다.

### 측정 정의

- **가로 넘침**: `document.documentElement.scrollWidth - clientWidth` (px). 45개 캡처 전체 0px. 긴 AWS stem·긴 URL(`docs.aws.amazon.com/…`) 줄바꿈 포함.
- **최소 버튼 높이**: 화면에 보이는 `button`, `[data-slot="button"]`, `a[role="button"]`, `input[type=button|submit]`, `.moi-kakao-login` 중 최소 높이. 내비게이션 텍스트 링크는 제외했다. 현행 계약은 `any-pointer:coarse` 기준 any-touch 44px·터치 없음 데스크톱 40px(DESIGN.md 5항·ADR-0050).
- **포인터·터치**: 폭별 `pointer:coarse`·`any-pointer:coarse` 둘다+`hasTouch`·`maxTouchPoints`를 기록한다. 320/375/768은 터치 에뮬레이션(`hasTouch+isMobile`), 1024/1280은 터치 없음. 하이브리드(주 fine+any coarse)는 본 스크립트에서 에뮬레이션하지 않으며 과거 증거를 소급해 성공 주장하지 않는다.
- **포커스**: 보이는 버튼 중 `disabled`·`tabindex=-1` 제외 도달 가능 수를 `focusMetrics`로 기록한다.
- **원시값 노출**: `body.innerText`에서 UUID, `opt-*`, 소문자 `saa-c03`, `dom-*` 검사. 사용자 라벨 `AWS SAA-C03`는 대소문자를 구분해 위반으로 잡지 않는다.

### 결과 요약

- 9개 화면 × 5개 뷰포트 = **45개 캡처**(에뮬레이션, 실기기 아님)
- 가로 넘침: **0건**(긴 AWS/URL 포함)
- 44px 미만 버튼: **8건** — 터치 없음 데스크톱(1024·1280) 홈·학습 시작의 `10문제 학습`/`학습 이력`/`학습 시작` 버튼이 40px(폭별 4건씩). any-touch(320/375/768, `any-pointer:coarse`)는 **0건** — 홈·학습 시작 모두 최소 44px. `results.json` 분류: `below44AnyTouchCount=0`·`below44TouchlessCount=8`.
- UUID·`opt-`·`saa-c03`·`dom-` 원시값 노출: **0건**
- 결과 요약은 320px에서 2×2, 768px 이상에서 4열 통계 그리드로 표시된다(#162).
- 결과 해설은 #194에서 한 문항씩 좌우 페이징으로 표시된다. 10문항 fixture 캡처 5종에서 `1/10` 진행 표시를 확인했다. BDD는 10문항 fixture에서 위치를 `\d+` 정규식으로 확인할 뿐 `1/10`을 직접 단언하지 않는다.

---

## 2. 남은 문제 / 이번 증거의 한계

| # | 항목 | 내용 | 후속 |
| --- | --- | --- | --- |
| 1 | 44px 미만 터치 타깃 | 터치 없음 데스크톱(1024·1280) 홈·학습 시작의 주요 버튼이 40px로, 45개 캡처 중 8건이 44px 미만이다. any-touch(320/375/768)는 `any-pointer:coarse` 매칭으로 44px이며 0건이다. 제품 수정 없이 보고만 하며 UX 완료·이슈 닫기 금지. | 디자인 계약 기준 판단·후속 수정 |
| 2 | API 오류 상태 미촬영 | 북마크·답안 저장·통계 API를 모두 200으로 mock해 `다시 시도` 오류 UI가 캡처되지 않았다. | 오류 상태 전용 캡처·터치 타깃 점검 |
| 3 | 실계정·배포 검증 아님 | 로컬 결정적 mock(에뮬레이션)이며 Kakao 로그인·D1·Worker·CDN 환경을 검증하지 않는다. 실서비스 사용자 테스트와 분리한다. | 배포 smoke(#131/#146) |
| 4 | Lighthouse 미측정 | 이번 캡처는 시각 증거만 다룬다. | 배포 URL Lighthouse 기록(#146) |
| 5 | 콘텐츠 규모 제한 | 결과 화면은 10문항 mock이지만, 긴 해설·표/코드/Mermaid가 섞인 실제 세트의 페이지 길이·스크롤 성능은 다를 수 있다. 도식은 기존 mock에 포함되지 않았다. | 실제 세트 기반 캡처 |
| 6 | 정정 반영 상태 미촬영 | 결과 화면의 정정 이력 패널은 `corrections: []` mock이라 노출되지 않았다. | 정정 데이터 포함 캡처 |
| 7 | 하이브리드·실기기 미검증 | 하이브리드(터치 화면 랩톱·태블릿 주 fine+any coarse) 실측 없음, iOS/Android 실기기·홈 화면 설치·Safari pinned tab·Windows 실환경 미검증(물리 기기 미보유). 에뮬레이션 성공을 실기기 성공으로 표시 금지. | 실기기 확보 후 검증 |

---

## 3. 변경 요약

- `scripts/capture-screens.mjs`: 제출 전 DTO 정합만 보정했다(제품·BDD·API 변경 없음). `toActiveDto`·`submittedDto` items에 `answerCount=item.correctOptionIds.length`(정답 ID 비노출) 추가, 복수 1문항(q-mock-2, 2개)으로 단일·복수 DTO를 포함하고, 리뷰 세션 current에 `answerCount=1`(채점 mock 단일에서 도출) 추가. 포인터 측정을 현행 `any-pointer:coarse` 계약으로 정정해 `pointer`+`any-pointer` 둘다·`hasTouch`·`maxTouchPoints`·`focusMetrics`를 기록하고, `below44AnyTouchCount`·`below44TouchlessCount`로 구분한다. 과거 `pointer:coarse` 표기를 비교용으로만 남기고 하이브리드 소급 주장을 제거한다. 대규모 분할·불필요 증거 전량 추가 없음.
- `results.json`: 캡처 기준 커밋 `14f331e`로 45개 측정값을 갱신했다. `below44=8(anyTouch=0, touchless=8)`, overflow 0, 원시값 0. 폭별 `anyPointerCoarse`·`pointerCoarse`·`hasTouch`·`focusMetrics`를 포함한다.
- 스크린샷: 9개 화면 × 5개 뷰포트 중 `study-active`·`study-result` 5종씩과 `history-populated-768` 1종을 재생성했다(나머지 32종 동일). `study-active`는 단일 안내(`정답 1개를 고르세요`) 정합으로 변경됐으며, 결과 5종은 `1/10`·요약·문항 목록을 유지한다. `review-*`·`study-result-*`의 화면 변화는 #199(복습·결과 보조텍스트 16px, `f05ca0f`)에서 오며 #201(ResultView 이동)이 아니다.
- favicon: 배포 HTML 실제 연결 5종+manifest 4종 포함 공개 자산 14종을 read-only로 직접 확인했다. `generate-icons --check` PASS, 로컬·배포 치수·MIME·바이트 일치, maskable 안전영역 기하 확인, 16/32 라이트·다크 프리뷰 생성 확인. 실기기 홈 설치·Safari pinned·Windows 실환경은 미검증으로 명시한다. 존재하지 않는 추정 경로 응답은 결함으로 분류하지 않는다.
