# moi 오케스트레이터 인수인계 — 2026-10-20

> 이 문서가 `2026-10-19-*.md` 3종보다 우선한다. 사용자 지시로 전체 작업을 정지한 시점의 스냅샷이다. 다음 오케스트레이터는 상태를 직접 다시 확인한 뒤 이어받는다.

## 0. 요약
- 기준: dev `11c3d35`. 수업(2026-10-22) 대비 배포 1회 완료(dev `4766d78`).
- 오늘 병합 16건: #155~#167, #169, #170, #172.
- 하네스 재편(ADR-0042): o/r/w1~w3 역할, 워커 콜백, 폴백 타이머, 수정 라운드.
- 정지 시점: 모든 워커 idle/done, 진행 중 단위는 WIP로 커밋·push했다(4장).

## 1. 역할과 패널 (ADR-0042, `agent-orchestration` 스킬)
| 탭 | 패널 | 에이전트(모델) | 역할 |
| --- | --- | --- | --- |
| o | w17:p1 | Claude | 오케스트레이터: 브리프·디스패치·콜백 수신·수락·커밋/PR/병합만 |
| r | w17:p3 | agy (Gemini 3.8 Flash) | 리뷰 전담(교차 리뷰·재리뷰) |
| w1 | w17:p2 | OpenCode (DeepSeek V4.1 Flash) | 구현 |
| w2 | w17:p7 | OpenCode (Muse Spark 1.3) | 구현 |
| w3 | w17:p6 | OpenCode (MiniMax M3.1 Flash Free) | 구현 |
- 패널 ID는 바뀔 수 있다: `herdr tab list --workspace w17`, `herdr agent list`로 재확인한다.
- 컨텍스트 리셋: opencode `/new`, agy `/clear`. 리셋 후 idle을 확인하고 나서 브리프를 보낸다.
- 디스패치 프롬프트(압축형): `brief=<path> 수행. 완료 시 턴 종료 전: herdr agent prompt w17:p1 "[callback] unit=<u> status=<done|blocked|failed> report=<path>"`
- 브리프·보고서 디렉터리: `$TMPDIR/opencode/moi-work/` (`brief-*.md`, `report-*.md`. 첫 줄 `status:`)
- 사용자 선호: 브리프·보고는 대화체 없이 bullet 압축형(토큰 절약).

## 2. 배포 상태 (#146)
- URL: https://moi.qus0in.workers.dev / 버전 `756078b4-f351-4d5f-a9f7-d52025fc091a` / dev `4766d78`
- 롤백 대상: `dccb0280-1714-4c96-b70a-ef2edababb51`
- 원격 D1: `0012_add-review-bookmarks`까지 적용(미적용 0). 사전 백업: time-travel bookmark + export(저장소 밖 보관, 내용 비공개)
- smoke 통과(`/`·`/study`·`/favicon.svg` 200, `/api/me` 401 + no-store)
- 배포 URL Lighthouse: 모바일 97 / 데스크톱 100(#132 코멘트). 로컬 preview(무압축) 87~88점은 기준으로 쓰지 않는다.
- **미배포 변경**(dev `4766d78..11c3d35`): #166 라우터 지연 로드·청크 실패 경계, #167 캡처 스크립트, #169 큰 화면 레이아웃, #170 하네스, #172 렌더 차단 CSS 축소. 수업 전 재배포 후보(#171 포함 권장).
- 사용자 몫: 실계정 Kakao 로그인 → 20문제 → 제출/결과 → 복습·북마크 확인.

## 3. 열린 PR
| PR | 내용 | 상태 | 다음 |
| --- | --- | --- | --- |
| #171 | 이력 상세 주소창 UUID 제거 | w1 리뷰 request-changes → 테스트 보강(`01639ca`, mutation Red→Green) 반영. r 재리뷰 중 정지 | r 재리뷰 → 병합 |
| #173 | THIRD_PARTY_NOTICES 재생성(95→380행) + 누락 검출 | CI 대기, 리뷰 전 | r 리뷰 → 병합 |
| #174 | CI `check:notices` 게이트, ADR-0043 | #173 병합 후 rebase 필요. 쟁점: ADR-0007 전체 supersede가 맞는지(보완이 적절할 수 있음) | r 리뷰 |
| #133 | 0.3 라이선스 페이지 인계(Draft) | 보존, 0.2 병합 금지 | — |

## 4. 중단된 단위 (WIP 커밋·push 완료)
| 브랜치 | 내용 | 상태 |
| --- | --- | --- |
| `fix/134-mermaid-label-quote` (`0de51dd`) | `saa-res-0129` 라벨 `G["Global Accelerator (고정 IP)"]` 인용 + Mermaid 라벨 품질 규칙 초안(`src/domain/question-quality/rules/mermaid.ts`) | 작성 중 중단. 게이트 미검증. 원격 D1 재등록 필요 여부 미확인(실행 금지) |
| `test/168-mermaid-inventory` (`1f068c5`) | `scripts/mermaid-inventory.mjs` + Pele PoC 의존성 | PoC 결과는 #168 코멘트. r 독립 리뷰 → **채택 여부는 사용자 결정**. 수업 직전 전환 금지 |
| `fix/132-lcp-shell` (`88b0ec6`) | 정적 셸 + 엔트리 load 후 주입 실험(88점) | **보류·병합 금지**(커스텀 플러그인, 상호작용 지연, 로그인 사용자 셸 깜빡임). 배포 URL 97점이라 불필요 |
| `test/bdd-flake` | BDD 간헐 실패 원인 규명 | 시작 직후 정지, 변경 없음. 증상: 동시 부하(다른 worktree 빌드·Lighthouse) 중 run-gates `test:bdd` 실패 1건이 4회, 단독 재실행은 39/39 |

## 5. 남은 일 (우선순위)
1. #171 재리뷰·병합 → dev 재배포(`release-deploy-workers` runbook, 원격 migration 변경 없음 확인)
2. #173 → #174 리뷰·병합(#174는 ADR supersede 쟁점 판단)
3. `fix/134-mermaid-label-quote` 마무리(게이트·리뷰), 원격 콘텐츠 반영은 #127 승인 범위 확인 후
4. #168 Pele: r 리뷰 → 사용자 채택 결정 대기
5. BDD flake 원인 규명(재시도 상향으로 은폐 금지)
6. 후속 관찰: 디스플레이 폰트(KoddiUD 외부 CDN) 무압축 1.66MB, 로그아웃 상태 `/api/me` 401 콘솔 오류(BP 96), Pele 채택 시 ADR-0034 supersede

## 6. 오늘 바뀐 계약
- 학습 주소: `/study`(서버 `GET /api/study/sets/current`로 복원), `/study/new`, `/study/result`(router state). 레거시 `/study/:id`·`/?study=` → 서버 소유권 확인 후 replace. #171이 병합되면 이력 상세 `/history/detail`(state)·레거시 `/history/:id`도 같은 패턴.
- 로그아웃 홈은 라우터·로그인 후 트리를 로드하지 않는다(`AuthenticatedApp` lazy). 최상위·라우트 lazy 실패는 `RouteErrorBoundary`(엔트리는 react-router 비의존).
- Tailwind utilities는 `src/ui/authenticated.css`(로그인 후 청크). 엔트리 CSS는 `moi-*` 토큰만.
- 큰 화면(≥1024px) 읽기 열 `--moi-reading-max: 720px`.
- `study.css`는 `study.css`/`study-result.css`/`study-feedback.css`로 분할, 스타일을 쓰는 컴포넌트가 직접 import.
- 화면 증거: `node scripts/capture-screens.mjs`(4174 포트 사전검사, 빌드 마커 확인) → `docs/evidence/132-screens/`.

## 7. 주의
- 비밀값·토큰·쿠키·DB export 내용을 저장소·이슈·PR에 남기지 않는다.
- 원격 D1 쓰기·Secrets 변경은 사용자 승인 범위(#127) 안에서만 한다. 이번 배포는 사용자 지시("배포 먼저 해봐")에 따른 것이다.
- main 병합·태그·Release는 정식 릴리스 때만(4종 산출물). 0.2.x 수업용 배포는 dev에서 한다.
- 스택 PR을 squash한 뒤에는 `git rebase --onto origin/dev <이전 하위 head>`로 옮기고 base를 바꾼다. base만 바꾸면 CI가 다시 돌지 않으므로 커밋을 갱신한다.
- 하네스 운용 기록(공개): usagi-ai-kr/usagi#1.
