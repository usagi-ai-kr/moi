---
name: agent-orchestration
description: Herdr 기존 워커 풀의 단위 디스패치·컨텍스트 리셋·산출물 검증·교차 모델 리뷰 절차. 장기 세션 컨텍스트 오염, 워커 산출물 불량(금지 import·stub·보고서 누락), 병합 전 검증이 필요할 때 사용. 새 에이전트·페인·리뷰어 생성은 사용자 승인 없이는 금지.
compatibility: sh와 git 필요 (scripts/check-worker-output.sh).
---

# 에이전트 오케스트레이션 — 컨텍스트·산출물 검증

출처: #48/#49 작업 중 GLM 5.3 Flash 워커의 컨텍스트 오염 사례, ADR-0023. 관련: `tdd-bdd-testing`, `architecture-boundaries`.

## 원칙
- **기존 Herdr 워커 풀만** 사용한다. 새 에이전트·페인·리뷰어 생성과 범위 밖 작업은 **사용자 승인 후에만** 한다.
- 워커를 마일스톤·피처명으로 고정 배치·명명하지 않는다. 작성자와 **다른 모델**이 리뷰·보조·보완한다.
- **단위마다 컨텍스트를 리셋/컴팩트**하고, 서로 다른 기능·이슈를 같은 세션에 누적하지 않는다. 200K+ 컨텍스트·이전 단위 맥락이 남은 세션은 재사용하지 않는다.
- 큰/횡단 단위는 강한 모델, 작은·결정적 단위는 Flash 계열을 사용한다. 모델 교체 시 새 세션에서 시작한다.
- 오케스트레이터는 브리프·디스패치·최종 검증·커밋만 하고, 구현·리뷰 산출물은 워커가 만든다.

## 디스패치 체크리스트
- [ ] 이슈 AC·ADR·소유 파일·금지 파일·보고서 경로를 브리프에 고정
- [ ] worktree/branch가 최신 `dev` 기준인지 확인
- [ ] 워커 세션이 비어 있거나 해당 단위 전용인지 확인(이전 단위 맥락 혼입 금지)
- [ ] 새 에이전트/페인/리뷰어가 필요하면 사용자 승인 확인
- [ ] 보고서 첫 줄 `status: in-progress`, 완료 시 `status: done`

## 수락 전 검증 (필수)
1. `sh .agents/skills/agent-orchestration/scripts/check-worker-output.sh <worktree> <report>` — 보고서·변경·금지 import/stub 검사.
2. `node .agents/skills/tdd-bdd-testing/scripts/run-gates.mjs` (fail-closed 7종).
3. `git diff`로 소유 범위·AC 매핑·테스트 실효성 확인. 범위 밖 변경·껍데기 테스트·stub이면 거부.
4. `node .agents/skills/harness-budget/scripts/check-module-lengths.mjs`로 모듈 예산 확인.
5. PR에는 테스트 위치/명령/결과·배포 URL·SHA·남은 blocker를 기록.

## 실패 처리
- 산출물이 오염됐거나(금지 import·stub·무관 모듈 언급) 보고서/테스트가 없으면 **병합하지 않는다**.
- 워크트리 변경은 폐기하고 브랜치만 보존한다. 같은 워커에게 재작업을 맡기더라도 **컨텍스트를 리셋**하고 범위를 더 좁힌다. 반복 실패 시 다른 모델/워커로 재배정한다.
- 제공자 오류(429/5xx/timeout)와 모델/컨텍스트 문제를 구분해 기록한다. 제공자 장애면 재시도, 컨텍스트 문제면 리셋·재배정.

## 스크립트
- `sh .agents/skills/agent-orchestration/scripts/check-worker-output.sh <worktree> <report> [--allow-empty]` — 종료 코드 0 통과, 1 위반, 2 사용 오류.
- `sh .agents/skills/agent-orchestration/scripts/check-worker-output.test.sh` — 회귀 테스트(fixture).

## 참고
- ADR-0023(컨텍스트 리셋·산출물 검증), `AGENTS.md` 작업 원칙, `architecture-boundaries`(domain 순수성)
