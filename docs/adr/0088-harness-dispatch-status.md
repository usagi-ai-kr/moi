---
id: ADR-0088
title: 디스패치 큐·콜백 상태 점검 하네스
status: Accepted
date: 2026-10-22
related: ["ADR-0042", "ADR-0023", "ADR-0051"]
---

# ADR-0088: 디스패치 큐·콜백 상태 점검 하네스

## 배경
- 콜백이 o 패널에 일회성 프롬프트로만 전달되어 놓치기 쉽고, 워커가 `notify.sh`를 빼먹고 종료해도 점검 수단이 없었다.
- 워커→리뷰어 배정이 o 수작업이어서 디스패치 상태를 한눈에 볼 도구가 필요했다.

## 결정
- 디스패치 큐 파일 `tmp/dispatch-queue.tsv`에 단위별 한 줄을 기록한다: `unit worker reviewer brief report dispatched_at(UTC)`.
- `.agents/skills/agent-orchestration/scripts/dispatch-status.sh`로 큐의 각 unit에 대해 `callbacks.log` 마지막 status와 보고서 첫 줄을 대조해 `DONE / PENDING / MISSING / BLOCKED`를 출력한다. 폴링 루프는 만들지 않고 o가 필요할 때 호출하는 요약 도구다.
- 콜백 대상은 패널 ID 대신 이름 `o`를 기본으로 사용한다. `notify.sh` 인자 형식과 종료 코드는 유지한다.
- 워커는 종료 전 반드시 `notify.sh`를 호출하고, 실패하면 보고서 첫 줄을 `status: blocked`로 기록한다.
- 위 절차를 `agent-orchestration` SKILL과 문서에 반영한다. SKILL 본문은 120줄 이하를 유지한다.

## 결과
- 긍정: 디스패치 상태를 한눈에 점검할 수 있고, 콜백 누락을 빠르게 발견할 수 있다.
- 부정/제약: 큐 파일과 callbacks.log·보고서가 일치해야 하므로 o가 큐를 최신으로 유지해야 한다.

## 대안과 금지 사항
- 폴링 루프·자동 재시도·새 에이전트/페인 생성 금지.
- 메인 체크아웃 직접 수정·원격 호출·push/PR/커밋 금지.

## 참고
- ADR-0042(역할·콜백), ADR-0023(컨텍스트·검증), ADR-0051(정지·인계), `agent-orchestration` 스킬.