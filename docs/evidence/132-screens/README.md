# 핵심 화면 Viewport 증거 (#132 / #148)

- **기준 커밋 SHA**: `e26e28c869adbcf7fad94e18787ab65fc8e312a4` (`e26e28c`, dev 최신)
- **측정 방식**: 로컬 `pnpm build` + `vite preview` + Playwright 결정적 Route Mock (`scripts/capture-screens.mjs`). **실계정·배포 환경 검증이 아닌 로컬 mock 증거**이며, 실제 Kakao 로그인·D1·Worker API는 호출하지 않는다.
- **측정 일시**: 2026-10-20 09:49 KST (`results.json.generatedAt` = `2026-10-20T00:49:36.560Z`)
- **측정 뷰포트**: 320 / 375 / 768 / 1024 / 1280px (높이 800px, full-page 캡처)
- **재현**: `node scripts/capture-screens.mjs` (현재 HEAD를 빌드한 뒤 촬영. 빌드 생략 시 `--no-build`)
- **Lighthouse**: 이번 증거에서는 측정하지 않는다. 별도 PR #166에서 진행 중이다.

> 라우트 계약 변경(#148, #155~#164)을 반영했다. 풀이 중은 `/study`(진행 중 세트 복원 API), 결과는 `/study/new`에서 시작→답안→제출 후 `/study/result`로 이동해 촬영했다. `/study/:setId`·`/study/:setId/result`는 레거시 호환 리다이렉트다.

---

## 1. 화면별 뷰포트 스크린샷 및 측정 결과

| 화면 ID | 화면명 | 경로 | 320px | 375px | 768px | 1024px | 1280px | 최소 버튼 높이 | 가로 넘침 | 원시값 노출 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `home-logged-out` | 로그아웃 홈 | `/` | [320px](./home-logged-out-320.png) | [375px](./home-logged-out-375.png) | [768px](./home-logged-out-768.png) | [1024px](./home-logged-out-1024.png) | [1280px](./home-logged-out-1280.png) | 46px (카카오) | 없음 (0px) | 없음 |
| `home` | 홈(로그인 후) | `/` | [320px](./home-320.png) | [375px](./home-375.png) | [768px](./home-768.png) | [1024px](./home-1024.png) | [1280px](./home-1280.png) | 64px | 없음 (0px) | 없음 |
| `study-new` | 학습 시작 | `/study/new` | [320px](./study-new-320.png) | [375px](./study-new-375.png) | [768px](./study-new-768.png) | [1024px](./study-new-1024.png) | [1280px](./study-new-1280.png) | 64px | 없음 (0px) | 없음 |
| `study-active` | 풀이 중 | `/study` | [320px](./study-active-320.png) | [375px](./study-active-375.png) | [768px](./study-active-768.png) | [1024px](./study-active-1024.png) | [1280px](./study-active-1280.png) | 44px | 없음 (0px) | 없음 |
| `study-result` | 결과(해설 포함) | `/study/result` (진입 `/study/new`) | [320px](./study-result-320.png) | [375px](./study-result-375.png) | [768px](./study-result-768.png) | [1024px](./study-result-1024.png) | [1280px](./study-result-1280.png) | 44px | 없음 (0px) | 없음 |
| `history-empty` | 이력(0건) | `/history` | [320px](./history-empty-320.png) | [375px](./history-empty-375.png) | [768px](./history-empty-768.png) | [1024px](./history-empty-1024.png) | [1280px](./history-empty-1280.png) | N/A (버튼 없음) | 없음 (0px) | 없음 |
| `history-populated` | 이력(다건, 상세 펼침) | `/history` | [320px](./history-populated-320.png) | [375px](./history-populated-375.png) | [768px](./history-populated-768.png) | [1024px](./history-populated-1024.png) | [1280px](./history-populated-1280.png) | 64px | 없음 (0px) | 없음 |
| `review` | 복습(오답 후보) | `/review` | [320px](./review-320.png) | [375px](./review-375.png) | [768px](./review-768.png) | [1024px](./review-1024.png) | [1280px](./review-1280.png) | 44px | 없음 (0px) | 없음 |
| `account` | 계정 | `/account` | [320px](./account-320.png) | [375px](./account-375.png) | [768px](./account-768.png) | [1024px](./account-1024.png) | [1280px](./account-1280.png) | 64px | 없음 (0px) | 없음 |

상세 측정 데이터 원본: [`results.json`](./results.json)

### 측정 정의

- **가로 넘침**: `document.documentElement.scrollWidth - clientWidth` (px). 45개 캡처 전체 0px.
- **최소 버튼 높이**: 화면에 보이는 `button`, `[data-slot="button"]`, `a[role="button"]`, `input[type=button|submit]`, `.moi-kakao-login` 중 최소 높이. 내비게이션 텍스트 링크는 제외했다.
- **원시값 노출**: `body.innerText`에서 UUID, `opt-*`, 소문자 `saa-c03`, `dom-*` 검사. 사용자 라벨 `AWS SAA-C03`는 대소문자를 구분해 위반으로 잡지 않는다.

### 결과 요약

- 9개 화면 × 5개 뷰포트 = **45개 캡처**
- 가로 넘침: **0건**
- 44px 미만 버튼: **0건** (최소 44px)
- UUID·`opt-`·`saa-c03`·`dom-` 원시값 노출: **0건**
- 결과 요약은 320px에서 2×2, 768px 이상에서 4열 통계 그리드로 표시된다(#162).

---

## 2. 오전 산출물(`9518576`) 대비 해소된 문제

| # | 오전 발견 | 최신 dev(`e26e28c`) 확인 | 판정 |
| --- | --- | --- | --- |
| 1 | 주소창에 학습 세트 UUID가 남음 (`/study/:setId`) | `/study`가 `GET /api/study/sets/current`로 복원하고, 결과는 `/study/result` state로 이동. 촬영된 `finalPath`에 UUID 없음 | **해소** |
| 2 | 풀이 중 화면에 `questionId · v1` 내부 식별자 노출 (`QuestionView`) | 문항 본문·보기만 표시. UUID/`opt-`/`saa-c03`/`dom-` 0건 | **해소** |
| 3 | 결과 화면에 `opt-a` 형태의 내부 보기 ID 노출 (`ResultView`) | `optionOrder` 기준 보기 번호(1, 2, 3, 4)로 표시. `선택: 1` 형태 확인 | **해소** |
| 4 | 결과 화면에 `answered`·`pass`·`unanswered` 원시 응답 kind 노출 | `응답`·`Pass`·`미응답` 사용자 라벨로 표시. `Pass`는 `copy.study.pass`의 의도된 라벨 | **해소** (원시 enum 제거) |
| 5 | 이력 상세에 `saa-c03` 시험 코드·`dom-*` 도메인 코드 노출 | `AWS SAA-C03`·`보안`/`비용 최적화` 라벨로 표시. 상세 펼침 상태에서도 원시값 0건(촬영된 정상 상태 기준, 상세의 도메인 라벨 경로는 미촬영) | **해소**(촬영된 정상 상태 기준) |
| 6 | 통계의 `ok`·`insufficient-data` 상태 enum 노출 점검 필요 | `표본 충분`·`데이터 부족` 라벨로 표시 | **해소** |
| 7 | 결과 요약이 단순 목록 형태 | 모바일 2×2·768px 이상 4열 통계 그리드. `정답/답변/Pass/미응답` 구분 확인 | **개선** (#162) |
| 8 | 북마크 오류 재시도·페이지네이션 터치 타깃 44px 미만 가능성 | 촬영된 정상 상태 기준 최소 44px(이력 3건이라 페이지네이션은 미렌더). 페이지네이션 버튼 `min-h-[44px]`는 소스 기준, 북마크 버튼은 `min-h-[44px]` 확인 | **해소**(촬영된 정상 상태 기준) |
| 9 | 긴 AWS 공식 문서 URL의 320px 가로 넘침 가능성 | 3개 문항의 긴 `sourceUrls`가 320px에서 줄바꿈되고 문서 넘침 0px | **해소**(증거 범위) |
| 10 | 로딩 문구가 인증 확인과 데이터 로딩에서 혼용 | 라우트 로딩은 `불러오고 있습니다`, 세션 확인은 `로그인 상태를 확인하고 있습니다`로 분리 | **개선** (#162) |

---

## 3. 남은 문제 / 이번 증거의 한계

| # | 항목 | 내용 | 후속 |
| --- | --- | --- | --- |
| 1 | API 오류 상태 미촬영 | 북마크·답안 저장·통계 API를 모두 200으로 mock해 `다시 시도` 오류 UI가 캡처되지 않았다. `BookmarkButton` 오류 재시도는 `text-xs` ghost 버튼이라 오류 상태에서 44px 미만일 수 있다. | 오류 상태 전용 캡처·터치 타깃 점검 |
| 2 | 실계정·배포 검증 아님 | 로컬 결정적 mock이며 Kakao 로그인·D1·Worker·CDN 환경을 검증하지 않는다. | 배포 스테이징 smoke |
| 3 | Lighthouse 미측정 | 오전 Performance 72(FAIL)는 이번 캡처로 재측정하지 않았다. lazy 분할(#158) 효과도 이 증거만으로 판정할 수 없다. | PR #166 |
| 4 | 콘텐츠 규모 제한 | 결과 화면은 3문항 mock이다. 20문항·긴 해설·표/코드/Mermaid가 섞인 실제 세트의 페이지 길이·스크롤 성능은 다를 수 있다. | 실제 세트 기반 캡처 |
| 5 | 복습 진행 상태 미촬영 | `/review`는 오답 후보 목록만 촬영했다. 복습 시작·즉시 채점·종료 요약 화면은 이번 9개 화면 범위 밖이다. | 필요 시 화면 추가 |
| 6 | 정정 반영 상태 미촬영 | 결과 화면의 정정 이력 패널은 `corrections: []` mock이라 노출되지 않았다. | 정정 데이터 포함 캡처 |
| 7 | `Pass` 영문 라벨 유지 | 원시 enum은 제거됐지만 사용자 라벨 자체는 `Pass`다. 제품 문구를 `건너뜀`으로 바꾸려면 `copy.study.pass` 변경이 필요하다. | 문구 결정 |
| 8 | 1280px 레이아웃 폭 | 1280px에서 본문이 왼쪽 약 640px 열에 몰린다(#148 6항). | PR #169에서 수정 중 |

---

## 4. 변경 요약

- `scripts/capture-screens.mjs`: `/study` current API, `/study/new`→제출→`/study/result` 흐름, `/api/review/bookmarks`·`/api/review/*` mock, 원시값 4종 검사, 현재 HEAD 자동 빌드 반영. preview 포트 충돌 감지와 SIGTERM·고아 프로세스 정리를 추가했다.
- `docs/evidence/132-screens/**`: 45개 PNG와 `results.json`을 최신 dev 기준으로 교체. 오전 산출물은 덮어썼다.
- Lighthouse 결과는 이 문서에서 다루지 않는다(별도 PR #166).
