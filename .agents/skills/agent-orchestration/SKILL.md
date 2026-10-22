---
name: agent-orchestration
description: Herdr o/r/w1~w3 역할의 단위 디스패치·컨텍스트 리셋·산출물 검증·교차 모델 리뷰·콜백 수신 절차. 장기 세션 컨텍스트 오염, 워커 산출물 불량(금지 import·stub·보고서 누락), 병합 전 검증, 콜백 누락·리뷰 병목·작업 정지·인계가 필요할 때 사용. 새 에이전트·페인·리뷰어 생성은 사용자 승인 없이는 금지.
compatibility: sh와 git 필요 (scripts/check-worker-output.sh, scripts/notify.sh).
---

# 에이전트 오케스트레이션 — 역할·콜백·검증

출처: #48/#49 컨텍스트 오염 사례, ADR-0023(컨텍스트·검증), ADR-0042(역할·콜백), ADR-0051(정지·tmp 인계, ADR-0048 대체). 관련: `tdd-bdd-testing`, `architecture-boundaries`.

## 역할
| 역할 | 책임 | 금지 |
| --- | --- | --- |
| o | 브리프·디스패치·콜백 수신·최종 수락·커밋/PR/병합 | 직접 구현·수정, 게이트 코드 수정 |
| r | 교차 리뷰·재리뷰, 판정·차단 사유 기록, o에 콜백 | 구현 수정, 병합 |
| w1~w3 | 브리프 단위 구현·테스트·보고서, o에 콜백 | 리뷰 판정, 범위 밖 수정 |

- o/r/w1~w3은 패널 역할명이며 피처명 고정 배치가 아니다. 단위는 매번 새 브리프로 할당하고, 200K+ 또는 이전 단위 맥락이 남은 세션은 재사용하지 않는다.
- r은 작성자와 다른 모델이다. r이 작성한 산출물은 w 중 다른 모델이 리뷰한다. 새 패널·리뷰어는 사용자 승인 후에만 만든다.
- 리뷰는 r 전담. r이 쿼터·가용성으로 병목이면 유휴 w 중 작성자와 다른 모델이 리뷰하고, r 복귀 후 최종 확인한다.
- 큰/횡단 단위는 강한 모델, 작은·결정적 단위는 Flash 계열을 쓰고 모델 교체 시 새 세션에서 시작한다.

## 콜백 프로토콜
- 완료·blocked·failed **모두** 콜백한다. 침묵 완료는 없다.
- 형식: `[callback] unit=<unit> status=<done|blocked|failed> report=<path>`
- `sh .agents/skills/agent-orchestration/scripts/notify.sh o <unit> <status> <report>` — 콜백 대상은 이름 `o`를 기본으로 한다(패널 ID 직접 지정은 예외). `<MOI_WORK_DIR|보고서 디렉터리>/callbacks.log`에 먼저 기록하고 `herdr agent prompt`로 전송한다. 전송 실패는 `delivered=pending`으로 남기고 종료 0이며, o가 재전송한다. `--dry-run`은 기록·전송 없이 출력만 한다.
- o는 콜백을 받으면 보고서를 읽고 다음 단위를 디스패치한다. 같은 unit의 중복 콜백은 최신 status로 처리한다.

## 디스패치 큐·상태 점검
- o는 디스패치 시 `tmp/dispatch-queue.tsv`에 한 줄을 추가한다: `unit\tworker\treviewer\tbrief\treport\tdispatched_at(UTC)`.
- 상태 점검: `sh .agents/skills/agent-orchestration/scripts/dispatch-status.sh [queue.tsv] [callbacks.log]` — 큐의 각 unit에 대해 `DONE / PENDING(콜백 미수신) / MISSING(report 없음) / BLOCKED`를 출력한다.
- 폴링 루프는 만들지 않는다. o가 콜백 대기 중 필요할 때만 호출하는 요약 도구다. 콜백 자체가 완료 신호다.

## 워커 보고 규칙
- 워커는 종료 전 반드시 `notify.sh o <unit> <status> <report>`를 호출한다. 침묵 완료는 없다.
- notify.sh 호출이 실패하면 보고서 첫 줄을 `status: blocked`로 기록하고 o에 실패를 알린다.

## 완성 알림 (단위 묶음 완료)
- o가 단위 묶음 완료(전 PR merge·배포·smoke·이슈 close)를 판단하면 `orchestrator-completion-notify` 스킬로 Discord 알림을 **1회** 보낸다. 단위별 알림은 금지한다.
- 워커(w)·리뷰어(r)는 알림을 보내지 않는다. `--dry-run`으로 payload만 확인하고 실제 전송은 o가 한다.
- 알림 실패(설정·HTTP 오류)는 merge를 되돌리지 않고 blocker로 보고한다. webhook 등 secret 은 출력·리포트에 남기지 않는다.

## 폴링·폴백 타이머
- `herdr agent prompt --wait`·파일 폴링으로 완료를 추정하지 않는다. 완료 신호는 콜백뿐이다.
- 단위 묶음당 폴백 타이머 **1개, 15분**. 만료 시 해당 패널 출력을 읽어 triage하고, 완료면 보고서 확인, 정지면 재프롬프트, 오류면 재배정한다.

## SLA·초과 판정·재배정
- **작업 SLA 5분, 리뷰 SLA 10분.** 초과는 단 난이도가 아니라 **패널 상태**로 본다 — o가 판단을 요청할 때 초과 시각·관측된 증상을 함께 적는다.
- SLA 초과는 아래 4분류로 **먼저 분류**하고, 분류에 맞는 조치만 한다(재시작·재배정·사용자 확인이 섞이지 않게).
  1. **오케스트레이션 실패** — 브리프 모호·권한 없음·판단 요청 누락·패널 미배정. 조치: 브리프를 좁혀 **같은 모델·신규 세션**으로 재디스패치.
  2. **워커 능력** — 모델이 단위를 못 맞추는 경우(요구사항 오판·반복 실패). 조치: 더 강한 모델로 **재배정**(모델 교체는 아래 승인 절차).
  3. **외부** — 제공자 오류·429/5xx·네트워크·원격 API 지연. 조치: 재시도 1회 → 여전히 실패하면 다른 모델/제공자 경로로 재배정하고 blocker로 보고.
  4. **오차** — 단위 범위의 단순 실수(파일 위치·명령어·조사 부족). 조치: 같은 워커에 동일 브리프로 1회 재시도(콘텍스트 리셋) → 2회 실패 시 2번으로 승격.
- **유휴 패널 즉시 재배정** — 콜백을 보낸 패널·blocked/failed 로 끝난 패널은 즉시 대기 상태이므로 o는 다음 단위를 그 패널에 배정한다(브리프·worktree·금지 파일을 명시하고 새 단위 전용 세션에서 시작). 같은 worktree·브랜치를 두 패널에 동시에 배정하지 않는다.
- **정기 점검(5분 harness-watch)** — o는 콜백 대기 구간에서 5분마다 1회 `sh .agents/skills/agent-orchestration/scripts/harness-watch.sh [queue.tsv] [callbacks.log]` 를 호출해 OVERDUE/MISSING 을 확인한다. 점검은 **쓰기 없는 보고 전용**이며 상시 폴링 루프를 만들지 않는다(대기 구간에만 둔다). OVERDUE 는 위 4분류로 판정하고 그때 재시도·재배정을 결정한다.

## 패널 판단·모델 운영
- **판단 요청에는 각 모델의 성능·경향 요약을 함께 제시한다.** 현 패널: `codex-gpt-luna` = GPT-6-Luna(max), `codex-gpt-2` = GPT-6-Luna(max), `oc-minimax-flash` = MiniMax M3.1 Flash, `oc-beam-free` = Beam Free (패널이 바뀌면 이 표를 갱신한다). 요약에는 각 모델의 강점·약점(속도·정확도·장문 맥락 유지 등)을 1줄씩 적는다.
- **워커 추가·모델 교체는 판단 요청 → 사용자 승인 후 실행.** 승인 없이 새 패널을 만들거나 모델을 바꾸지 않는다. 교체가 승인·실행되면 `node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs --event confirmation --title "<교체 내용>" --summary "<모델·패널·사유>"` 로 Discord 통지를 1회 보낸다(단위별 알림 아님).
- **effort(추론 강도)는 o가 임의로 변경할 수 있다.** 기본은 **전 패널 max 또는 변경 불가** 상태를 유지하고, 낮추려면 판단 요청에 근거를 적어 승인받는다. effort 조정은 산출물 품질 차이로 기록하지 않는다.

## 승인·우선순위 (이슈 #288)
- 에이전트가 사용자 계정으로 남긴 이슈/PR 코멘트는 **사용자 승인으로 간주하지 않는다**. 코멘트에는 `[agent]` prefix를 필수로 붙인다.
- 우선순위 변경·범위 제외·후속 이관은 **사용자 명시 승인 링크** 없이는 금지한다.

## 디스패치 체크리스트
- [ ] 이슈 AC·ADR·소유 파일·금지 파일·보고서 경로를 브리프에 고정
- [ ] 이슈 라벨·Milestone과 사용자 최신 지시를 대조했다
- [ ] worktree/branch가 최신 `dev` 기준인지 확인
- [ ] 워커 세션이 비어 있거나 해당 단위 전용인지 확인(이전 단위 맥락 혼입 금지)
- [ ] 브리프에 콜백 지시(`notify.sh <o-pane> <unit> <status> <report>`)와 o 패널을 명시
- [ ] 새 에이전트/페인/리뷰어가 필요하면 사용자 승인 확인
- [ ] 보고서 첫 줄 `status: in-progress`, 완료 시 `status: done`

## 수락 전 검증 (필수)
1. `sh .agents/skills/agent-orchestration/scripts/check-worker-output.sh <worktree> <report>` — 보고서·변경·금지 import/stub 검사.
2. `node .agents/skills/tdd-bdd-testing/scripts/run-gates.mjs` (fail-closed 7종).
3. `git diff`로 소유 범위·AC 매핑·테스트 실효성 확인. 범위 밖 변경·껍데기 테스트·stub이면 거부.
4. `node .agents/skills/harness-budget/scripts/check-module-lengths.mjs`로 모듈 예산 확인.
5. PR에는 테스트 위치/명령/결과·배포 URL·SHA·남은 blocker를 기록.

## 리뷰·수정 라운드
- r은 작성자와 다른 모델이 맡고, 판정(승인/차단)과 차단 사유를 PR 코멘트·리뷰 보고서에 남긴 뒤 o에 콜백한다.
- 수정 라운드는 **차단 사항만** 작성자에게 보내며 **최대 2회**. 비차단 지적은 후속 단위로 기록한다.
- 2회 후에도 차단이 남으면 병합하지 않고 다른 모델/워커로 재배정한다.

## 작업 정지·인계 (ADR-0051)
- 정지 지시 후 새 외부 쓰기(PR·이슈·병합·배포·push·새 디스패치)는 금지. 허용은 지시가 명시한 인계 산출물뿐이다.
- 순서: 패널별 중지 프롬프트(테스트·서버 종료, 미커밋 보존, 3줄 상태 응답 후 대기) → 폴백 타이머 해제 → 브랜치·SHA·미커밋·잔여 프로세스 확인 → `tmp/handover-<날짜>.md` 작성 후 인계 이슈(`tuck`, 현재 Milestone)에 게시(다음 o 재개 프롬프트 포함). 인계는 `docs/`에 두지 않고, 남겨야 할 내용은 이슈로 처리한다.
- 미커밋 워커 변경은 버리지 않고 `wip:` 커밋으로 보존하며 게이트 미검증을 표시한다.
- 브리프·보고서·콜백 로그는 메인 저장소 `tmp/`의 절대 경로로 전달한다(gitignore, `.gitkeep`만 커밋). worktree의 `tmp/`·`$TMPDIR`는 쓰지 않는다.

## 실패 처리
- 산출물이 오염됐거나(금지 import·stub·무관 모듈 언급) 보고서/테스트가 없으면 **병합하지 않는다**.
- 워크트리 변경은 폐기하고 브랜치만 보존한다. 재작업 시 **컨텍스트를 리셋**하고 범위를 더 좁힌다.
- 제공자 오류(429/5xx/timeout)와 모델/컨텍스트 문제를 구분해 기록한다. 제공자 장애면 재시도, 컨텍스트 문제면 리셋·재배정, 반복 실패는 다른 모델/워커로 재배정한다.

## 스크립트
- `sh .agents/skills/agent-orchestration/scripts/check-worker-output.sh <worktree> <report> [--allow-empty]` — 종료 코드 0 통과, 1 위반, 2 사용 오류.
- `sh .agents/skills/agent-orchestration/scripts/notify.sh <target-pane> <unit> <status> <report> [--dry-run]` — 종료 코드 0 전송/기록, 1 로그 기록 실패, 2 사용 오류.
- `sh .agents/skills/agent-orchestration/scripts/harness-watch.sh [queue.tsv] [callbacks.log]` — 디스패치 큐 상태 점검(DONE/RUNNING/OVERDUE/MISSING). 쓰기 없음.
- 회귀 테스트: `check-worker-output.test.sh`, `notify.test.sh`.

## 참고
- ADR-0023(컨텍스트 리셋·산출물 검증), ADR-0042(역할·콜백), `AGENTS.md` 작업 원칙, `architecture-boundaries`(domain 순수성)
