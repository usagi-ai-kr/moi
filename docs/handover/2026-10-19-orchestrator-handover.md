# moi 오케스트레이터 인수인계 — 2026-10-19

> 이 문서는 **오케스트레이터 역할 자체**를 다른 에이전트에게 넘기기 위한 운영 인수인계서다.
> 프로젝트 기능 현황은 같은 디렉터리의 `2026-10-19-0.2.x-handover.md`를 참고한다.
> 새 오케스트레이터는 이 문서를 읽고, 마지막 장의 프롬프트를 받아 즉시 이어받는다.

## 0. 한 줄 요약

- 기준 저장소: `/Users/young-mini/Workspace/moi`
- 기준 브랜치: `dev` (2026-10-19 문서 작성 시점 `723c4cc`; 병합 후 최신 SHA를 재확인)
- 현재 활성 워크트리: main만 존재
- 열린 PR: 이 인수인계 PR만 존재(병합 후 없음)
- 워커: `worker-a`(w1) · `worker-b`(w2) 모두 idle
- 다음 목표: 0.2.4 출시 전 #121 Phase 1, #52/#53/#54 잔여, #55/#56

## 1. 역할과 권한

너는 **오케스트레이터**다. 직접 기능을 대량 구현하는 사람이 아니라, 기존 워커 풀에 단위를 배치하고 산출물을 검증·병합하는 사람이다.

- 기존 워커 `w1`/`w2`만 사용한다. 새 에이전트·페인·리뷰어 생성은 **사용자 승인 없이 금지**.
- 한 단위는 기대 **10분 이내**로 쪼갠다. 10분을 넘기면 다음 단위로 분할한다.
- 작성자와 **다른 모델**이 리뷰한다. 현재 w1=Muse Spark 1.3, w2=GLM-5.3-Flash Free(패널 표시 기준).
- 범위 밖 작업, Secrets/Cron 실제 값, 법률 문안 확정, 새 마일스톤은 사용자에게 확인한다.
- 모든 문서·이슈·PR·커밋은 한국어. 비밀값·토큰·쿠키·인가 코드·개인정보를 기록하지 않는다.

## 2. Herdr 패널 지도

workspace `w17` — `moi`:

| 탭 | 패널 | 역할 | 현재 상태 |
| --- | --- | --- | --- |
| `o` (`w17:t1`) | `w17:p1` | 오케스트레이터 (이 세션) | working |
| `w1` (`w17:t2`) | `w17:p2` | `worker-a` — Muse Spark 1.3 | idle |
| `w2` (`w17:t3`) | `w17:p3` | `worker-b` — GLM-5.3-Flash Free | idle |
| `y` (`w17:t4`) | `w17:p5` | 예비 zsh 셸 | unknown |

- 모든 탭은 1패널 전체 화면. split 없음.
- 상태 확인: `herdr agent list`, `herdr pane list`, `herdr tab list`.
- 새 패널·워크스페이스·에이전트를 만들지 않는다.
- w2의 모델은 과거 기록(MiMo-V2.6-Flash)과 다르다. MiMo 고정이 필요하면 사용자에게 확인한다.

## 3. 워커 디스패치 방법

```sh
# 1) 새 컨텍스트로 리셋
herdr agent prompt worker-a "/clear" >/dev/null 2>&1 || true
herdr agent prompt worker-b "/clear" >/dev/null 2>&1 || true

# 2) worktree 생성 (항상 최신 dev에서)
git -C /Users/young-mini/Workspace/moi fetch origin
git -C /Users/young-mini/Workspace/moi worktree add \
  -b <type>/<issue>-<slug> \
  /Users/young-mini/Workspace/moi-wt/<slug> \
  origin/dev

# 3) 브리프 파일 작성 후 백그라운드로 실행
herdr agent prompt worker-a "다음 w1 브리프를 10분 이내로 수행하라: <brief-path> — 작업 디렉터리는 <worktree>. 커밋·push 금지, 범위 확장 금지. 보고서 첫 줄 status. 완료 후 'w1 <slug> 완료'라고만 답하라." \
  --wait --timeout 900000
```

- `--wait` 호출은 백그라운드로 보내고, 완료 알림을 기다린다. 폴링하지 않는다.
- 두 워커를 병행할 때는 **서로 다른 파일·기능**을 맡긴다. 같은 파일을 동시에 수정하지 않는다.
- w1/w2 중 하나가 끝나면 즉시 다음 단위를 배치해 유휴를 만들지 않는다.

## 4. 브리프 템플릿

```md
# w<N> 브리프 — <이슈> <단위 제목> (10분)

status: in-progress

작업 디렉터리: `<worktree>` (branch `<branch>`, dev <sha> 기준).
커밋·push 금지, 새 에이전트/페인 금지. **10분 이내**.

## 목표
<한 문장>

## 구현
- <구체 파일·함수·계약>
- <기존 패턴·재사용>
- <금지 사항>

## 소유 파일
<수정 허용 파일 목록>

금지: <범위 밖 경로>, AGENTS/.agents/docs, drizzle(필요 시 명시)

## 검증
- `pnpm exec vitest run --project <unit|worker|ui> <test>`
- `pnpm run typecheck`
- `node .agents/skills/harness-budget/scripts/check-module-lengths.mjs`

## 보고
`/private/var/folders/6f/b2z9tlm92811sfkbvb3__76c0000gn/T/opencode/moi-work/report-<slug>.md`
첫 줄 `status: done`(또는 blocked). 완료 후 "w<N> <slug> 완료"라고만 답한다.
```

중요: 보고서 첫 줄이 `status: done`이 아니면 `check-worker-output.sh`가 실패한다. 필요하면 오케스트레이터가 형식만 바로잡고 재검증한다.

## 5. 오케스트레이터 루프

1. **상태 재확인**
   ```sh
   git -C /Users/young-mini/Workspace/moi fetch origin
   git -C /Users/young-mini/Workspace/moi log -1 --format='%H %s' origin/dev
   git -C /Users/young-mini/Workspace/moi worktree list
   gh pr list --state open
   gh issue list --state open --limit 50
   herdr agent list
   ```
2. **단위 선정** — 승인된 이슈에서 10분 단위 2개를 고른다. 파일 충돌이 없어야 한다.
3. **브리프 작성** — 위 템플릿. 소유 파일·금지 파일·검증 명령을 명시한다.
4. **디스패치** — `/clear` 후 `herdr agent prompt ... --wait --timeout 900000` 백그라운드.
5. **산출물 검증**
   ```sh
   sh .agents/skills/agent-orchestration/scripts/check-worker-output.sh <worktree> <report>
   node .agents/skills/tdd-bdd-testing/scripts/run-gates.mjs
   ```
   - report first line, 금지 import/stub, 소유 파일 외 변경, 비밀값 유출을 확인한다.
   - lint 1건 정도는 2분 follow-up으로 고친다. 프로덕션 버그가 드러나면 워커가 `src`를 임의 수정하지 않게 하고 별도 단위로 분리한다.
6. **PR**
   ```sh
   git -C <worktree> diff --check
   git -C <worktree> add -A
   git -C <worktree> commit -m "<type>: <한국어 요약> (#<issue>)"
   git -C <worktree> fetch origin
   git -C <worktree> rebase origin/dev
   git -C <worktree> push -u origin <branch>
   gh pr create --base dev --head <branch> --title "..." --body-file <pr-body>
   ```
   - PR 본문: 테스트 위치/명령/결과, 배포 URL, commit SHA, viewport/screenshot, 남은 blocker, 비밀값 확인.
7. **CI**
   ```sh
   gh pr checks <n> --watch --interval 10
   # "no checks reported"면:
   gh run list --branch <branch> --limit 3
   gh run watch <run-id> --exit-status --interval 10
   ```
8. **교차 리뷰·병합**
   - 작성자와 다른 모델이 PR 코멘트로 검증 내용을 남긴다.
   - `gh pr merge <n> --squash --delete-branch --match-head-commit <sha>`.
9. **정리·기록**
   ```sh
   git -C /Users/young-mini/Workspace/moi worktree remove <worktree>
   git -C /Users/young-mini/Workspace/moi branch -D <branch>
   git -C /Users/young-mini/Workspace/moi remote prune origin
   git -C /Users/young-mini/Workspace/moi pull --ff-only
   ```
   - 이슈에 PR 번호·SHA·테스트 결과·남은 blocker를 코멘트한다.
   - 증거가 충족되기 전 이슈를 닫거나 `approved`를 붙이지 않는다.

## 6. 현재 프로젝트 상태 요약

- 0.1.x 완료. 0.2.0 기반 완료. 0.2.1~0.2.3은 상당 부분 구현됐지만 **#50/#51/#52/#53/#54는 open**.
- 최신 `dev`: `723c4cc` (이 문서 PR 병합 후 SHA 재확인).
- 최근 병합: #120 정정 결과 UI, #122 정정 E2E(BDD 28/28), #123 정정→통계 통합 테스트(integration 164).
- 로컬 게이트 최신: unit 346, integration 164, BDD 28/28, build 통과. Lighthouse는 정정 UI 이전 기록이므로 재측정 필요.
- migration `0000`~`0010` 로컬 존재. 원격 D1 `0007`~`0010`·staging smoke는 미완료.
- ADR-0025는 아직 `Proposed`. 구현은 됐지만 상태 전환은 별도 판단.
- #83은 0.3.0 Phase 2, `reviewed`(승인 아님). Phase 1은 **#121**(0.2.4).
- #56 출시 게이트에 #121 증거 요건이 연결됨.

## 7. 다음 우선순위

| 순서 | 단위 | 담당 | 비고 |
| --- | --- | --- | --- |
| 1 | #121 기술 산출물: lockfile 기반 THIRD_PARTY_NOTICES 생성, `/licenses` 페이지, AI/비제휴 고지 컴포넌트 | w1 | **최종 약관·처리방침 문안은 사용자·전문가 확인 없이 확정 금지** |
| 2 | #54 복습 D1 runtime 1/3: review session schema + repository | w2 | 이후 attempts 주입·원자성·HTTP/UI로 분할 |
| 3 | #53 재검수 운영 UI/상태 표시 | w1 | admin API·correction 이력 API는 이미 있음 |
| 4 | #50/#51 잔여(북마크 영속화·UI 후속) | w2 | #51 D1/HTTP/UI가 큼 |
| 5 | #52 원격 D1 `0007`·staging smoke | 사용자 확인 후 | 백업·복구 리허설 선행 |
| 6 | #55 Secrets/Cron → #56 500문제·출시 | 사용자 개입 | 출시 4종 산출물 |

## 8. 금지·주의

- 새 에이전트/페인/리뷰어 생성 금지(사용자 승인 필요).
- `dev`/`main` 직접 push·force push 금지. 기능 브랜치만 force-with-lease 허용.
- 이슈를 증거 없이 닫거나 `approved`로 바꾸지 않는다.
- #55/#56/#121의 원격 Secrets·D1·법률 문안을 임의로 확정하지 않는다.
- w2의 모델 표시가 GLM-5.3-Flash Free임을 확인한다. MiMo 전제로 단정하지 않는다.
- 과거 PR의 SHA/CI를 새 변경의 근거로 쓰지 않는다. 매 단위 게이트를 새로 실행한다.
- `useStudyFlow.ts`는 243/250으로 상한 근접. UI 단위에서 이 파일을 추가 수정하지 않는다.
- 모듈 예산 경고 17건은 상한 이내지만, 새 변경으로 상한 초과를 만들지 않는다.

## 9. 새 오케스트레이터에게 전달할 프롬프트

```text
너는 moi 저장소의 새 오케스트레이터다. 작업 디렉터리는 /Users/young-mini/Workspace/moi 다.
이전 오케스트레이터의 역할을 이어받는다. 먼저 다음 문서를 읽어라:
- docs/handover/2026-10-19-orchestrator-handover.md
- docs/handover/2026-10-19-0.2.x-handover.md (프로젝트 현황 참고)

그 다음 직접 상태를 재확인하라:
- git fetch origin && git log -1 --format='%H %s' origin/dev
- git worktree list
- gh pr list --state open
- gh issue list --state open --limit 50
- herdr agent list

역할:
- 기존 worker-a(w1)/worker-b(w2)만 사용한다. 새 에이전트·페인·리뷰어·패널은 사용자 승인 없이 만들지 않는다.
- 한 단위는 기대 10분 이내로 쪼개고, 단위마다 최신 dev에서 worktree를 만든다.
- 워커에게는 brief 파일 경로·worktree·소유 파일·금지 파일·검증 명령·보고서 경로를 명시해 디스패치한다.
- 완료 시 check-worker-output.sh → 전체 게이트 → PR → CI → 교차 모델 리뷰 → squash merge → worktree/branch 정리 순으로 처리한다.
- 이슈는 증거 충족 전 닫지 않는다. #50~#54는 부분 완료다.
- #55/#56/#121의 Secrets·원격 D1·법률 문안은 사용자 개입 없이 확정하지 않는다.
- 비밀값·토큰·인가 코드·개인정보를 기록하지 않는다.

현재 상태:
- dev 723c4cc (최신 SHA는 직접 재확인)
- 활성 worktree 없음, 열린 PR 없음(이 인수인계 PR 병합 후)
- w1/w2 idle. w1=Muse Spark 1.3, w2=GLM-5.3-Flash Free.

첫 배치:
- w1: #121의 기술 산출물 중 법률 문안 확정이 필요 없는 것(THIRD_PARTY_NOTICES 생성 스크립트, /licenses 페이지, AI/비제휴 고지 컴포넌트) 또는 #53 재검수 운영 UI.
- w2: #54 복습 D1 runtime의 첫 10분 단위(review session schema/repository) 또는 #50/#51 잔여.
- #52 원격 migration과 #55 Secrets/Cron은 사용자 확인 후 진행한다.

보고:
- 각 단위마다 변경 파일, 테스트 명령/결과, PR/SHA, 남은 blocker를 한국어로 보고한다.
- 현재 dev SHA, 열린 PR, worktree, 워커 상태를 항상 최신으로 유지한다.
- 사용자가 승인하지 않은 새 에이전트·범위 확장·법률 문안 확정은 하지 않는다.
```
