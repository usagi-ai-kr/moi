---
id: ADR-0093
title: 가중 점수 기반 오케스트레이터 진행 보고
status: Accepted
date: 2026-10-22
related: []
---

# ADR-0093: 가중 점수 기반 오케스트레이터 진행 보고

## 배경
- ADR-0075는 단위별 알림을 금지하고 ADR-0085는 단위 중간 진행 알림을 금지한다. o가 장기 작업의 변화를 주기적으로 파악할 통합 보고는 필요하지만, 이벤트 개수만 세면 영향도가 큰 병합·차단과 작은 상태 변경을 구분하지 못한다.
- 보고 점수·임계값은 바뀔 수 있으므로 코드와 분리해 관리해야 한다.

## 결정
- ADR-0085를 supersede한다. `completion`, `intervention`, `confirmation`, `deliverable` 이벤트는 유지하고, 단위별 보고 금지는 유지한다. 추가하는 `progress`는 여러 작업을 합산한 정기 현황 이벤트다.
- `.agents/skills/orchestrator-completion-notify/progress-weights.json`에서 점수와 기준을 관리한다. PR 병합 3, blocked/failed 콜백 3, done 콜백 2, PR open 2, dev CI red↔green 2, PR merge-state 변경 1, 이슈 close/open 1점이며 임계값은 6점이다.
- 점수 6 이상이면 즉시 보고한다. 마지막 보고 후 60분이 지나면 점수 1 이상일 때만 보고하고, 0점이면 건너뛴다. 성공 전송 후 점수를 초기화하며 `tmp/progress-state.json`에 기준선·점수·콜백 로그 offset을 저장한다.
- o 전용 `moi-progress-report` PM2 프로세스가 60초 간격으로 GitHub CLI와 `tmp/callbacks.log`를 읽는다. 읽기는 조회만 수행한다. 완료·blocked/failed 콜백은 알림 relay 로그에서 dedupe하여 가중치에 반영한다.
- 진행 현황은 최대 5줄로 최근 병합 PR/SHA, 열린 PR 상태, dev CI, blocked/failed 작업과 다음 조치, 지정 마일스톤 열린 이슈 수를 담는다. webhook URL·환경 값·콜백 보고서 경로는 출력하지 않는다.
- 기존 `notify-completion.mjs`에는 `progress` 이벤트 스타일만 추가한다. 검증은 Node 내장 테스트와 로컬 mock HTTP만 사용하고 실제 webhook 전송 테스트는 금지한다.

## 결과
- 긍정: 이벤트 중요도에 따라 알림 빈도를 조절하고, 긴 작업의 진행·차단 상태를 한 번에 파악한다.
- 부정/제약: GitHub CLI 인증·네트워크 또는 PM2 프로세스가 중단되면 현황이 갱신되지 않는다. 60초 polling으로 GitHub 조회가 반복된다.

## 대안과 금지 사항
- 이벤트 개수 임계값, 단위별 즉시 알림, 원격 dev/main 변경은 금지한다.
- webhook 원문·토큰과 `.env` 값을 로그·상태 파일·보고 본문에 기록하지 않는다.
- 실제 Discord 전송 테스트는 금지한다. 자동 테스트는 로컬 mock HTTP만 쓴다.

## 참고
- ADR-0075, ADR-0085, 스킬 `orchestrator-completion-notify`, `docs/harness/completion-notify.md`, 이슈 brief `tmp/brief-progress-report.md`.
