---
name: agent-orchestration
description: Herdr o/r/w1~w3 역할의 단위 디스패치·컨텍스트 리셋·산출물 검증·교차 모델 리뷰·콜백 수신 절차. 장기 세션 컨텍스트 오염, 워커 산출물 불량(금지 import·stub·보고서 누락), 병합 전 검증, 콜백 누락·리뷰 병목이 필요할 때 사용. 새 에이전트·페인·리뷰어 생성은 사용자 승인 없이는 금지.
compatibility: sh와 git 필요 (scripts/check-worker-output.sh, scripts/notify.sh).
---

# 에이전트 오케스트레이션 — 역할·콜백·검증

출처: #48/#49 컨텍스트 오염 사례, ADR-0023(컨텍스트·검증), ADR-0042(역할·콜백). 관련: `tdd-bdd-testing`, `architecture-boundaries`.

## 역할
| 역할 | 책임 | 금지 |
| --- | --- | --- |
| o | 브리프·디스패치·콜백 수신·최종 수락·커밋/PR/병합 | 직접 구현·수정, 게이트 코드 수정 |
| r | 교차 리뷰·재리뷰, 판정·차단 사유 기록, o에 콜백 | 구현 수정, 병합 |
| w1~w3 | 브리프 단위 구현·테스트·보고서, o에 콜백 | 리뷰 판정, 범위 밖 수정 |

- o/r/w1~w3은 패널 역할명이며 피처명 고정 배치가 아니다. 단위는 매번 새 브리프로 할당하고, 200K+ 또는 이전 단위 맥락이 남은 세션은 재사용하지 않는다.
- r은 작성자와 다른 모델이다. r이 작성한 산출물은 w 중 다른 모델이 리뷰한다. 새 패널·리뷰어는 사용자 승인 후에만 만든다.
- 큰/횡단 단위는 강한 모델, 작은·결정적 단위는 Flash 계열을 쓰고 모델 교체 시 새 세션에서 시작한다.

## 콜백 프로토콜
- 완료·blocked·failed **모두** 콜백한다. 침묵 완료는 없다.
- 형식: `[callback] unit=<unit> status=<done|blocked|failed> report=<path>`
- `sh .agents/skills/agent-orchestration/scripts/notify.sh <o-pane> <unit> <status> <report>` — `<MOI_WORK_DIR|보고서 디렉터리>/callbacks.log`에 먼저 기록하고 `herdr agent prompt`로 전송한다. 전송 실패는 `delivered=pending`으로 남기고 종료 0이며, o가 재전송한다. `--dry-run`은 기록·전송 없이 출력만 한다.
- o는 콜백을 받으면 보고서를 읽고 다음 단위를 디스패치한다. 같은 unit의 중복 콜백은 최신 status로 처리한다.

## 폴링·폴백 타이머
- `herdr agent prompt --wait`·파일 폴링으로 완료를 추정하지 않는다. 완료 신호는 콜백뿐이다.
- 단위 묶음당 폴백 타이머 **1개, 15분**. 만료 시 해당 패널 출력을 읽어 triage하고, 완료면 보고서 확인, 정지면 재프롬프트, 오류면 재배정한다.

## 디스패치 체크리스트
- [ ] 이슈 AC·ADR·소유 파일·금지 파일·보고서 경로를 브리프에 고정
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

## 실패 처리
- 산출물이 오염됐거나(금지 import·stub·무관 모듈 언급) 보고서/테스트가 없으면 **병합하지 않는다**.
- 워크트리 변경은 폐기하고 브랜치만 보존한다. 재작업 시 **컨텍스트를 리셋**하고 범위를 더 좁힌다.
- 제공자 오류(429/5xx/timeout)와 모델/컨텍스트 문제를 구분해 기록한다. 제공자 장애면 재시도, 컨텍스트 문제면 리셋·재배정, 반복 실패는 다른 모델/워커로 재배정한다.

## 스크립트
- `sh .agents/skills/agent-orchestration/scripts/check-worker-output.sh <worktree> <report> [--allow-empty]` — 종료 코드 0 통과, 1 위반, 2 사용 오류.
- `sh .agents/skills/agent-orchestration/scripts/notify.sh <target-pane> <unit> <status> <report> [--dry-run]` — 종료 코드 0 전송/기록, 1 로그 기록 실패, 2 사용 오류.
- 회귀 테스트: `check-worker-output.test.sh`, `notify.test.sh`.

## 참고
- ADR-0023(컨텍스트 리셋·산출물 검증), ADR-0042(역할·콜백), `AGENTS.md` 작업 원칙, `architecture-boundaries`(domain 순수성)
