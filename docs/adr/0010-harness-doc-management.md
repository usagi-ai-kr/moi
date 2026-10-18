---
id: ADR-0010
title: 하네스·문서 관리 체계
status: Accepted
date: 2026-10-18
related: ["#7", "#9"]
---

# ADR-0010: 하네스·문서 관리 체계

## 배경
- 다중 에이전트 세션에서 작업 일관성을 유지하려면 규칙·절차·판단 기록의 위치와 우선순위가 고정되어야 한다.

## 결정
- 구성: `AGENTS.md`(최상위 규칙), `.agents/skills/`(실행 절차 + 스크립트), `docs/adr/`(기술 판단 기록), GitHub Issues(작업 추적).
- 모든 기술적 추가 판단·변경은 ADR로 기록한다. 기존 결정을 뒤집으면 기존 ADR을 `Superseded by ADR-NNNN`으로 바꾸고 새 ADR을 추가한다(본문 수정 금지, 오탈자 제외).
- `AGENTS.md` 변경은 PR로만 반영하고, 같은 PR에서 관련 스킬·문서를 동기화한다.
- 스킬은 Agent Skills 표준을 준수한다(`name`=디렉터리명 일치 kebab-case ≤64자, `description` 필수 ≤1024자, 본문 ≤500줄 권장). 모든 스킬은 `SKILL.md`+`scripts/` 구조를 가지며, 반복·결정적 작업은 스크립트로 구현한다. 수정 후 `node .agents/scripts/validate-skills.mjs`로 검증한다(AGENTS.md 스킬 인덱스 대조 포함).
- 스킬 문서의 실행 명령 예시는 repo root 기준 경로(`.agents/skills/<스킬>/scripts/<스크립트>`)로 표기하고 실행 CWD가 root임을 명시한다.
- 이슈 완료 시 확정된 합의를 ADR/AGENTS.md/스킬에 반영(승격)한다. 이슈는 작업 추적용이고 영속 규칙은 문서에 둔다.
- 문서 충돌 해소 기준(우선순위): **사용자가 승인한 이슈의 명시적 합의 → 이를 반영한 Accepted ADR → AGENTS.md → 스킬 세부 절차.** 충돌 시 같은 PR에서 supersede·동기화로 해소한다.
- 라벨 `focus`/`instant`/`tuck`은 작업 성격의 분류이고 진행 상태가 아니다. 약칭 라벨(f/i/t)은 만들지 않는다.

## 결과
- 긍정: 규칙·판단·절차의 위치가 고정되어 에이전트 간 재해석이 줄어든다.
- 부정/제약: 문서 동기화 비용(스킬 수정 시 검증·인덱스 갱신 동반).

## 대안과 금지 사항
- 규칙을 이슈 본문에만 두는 방식 — 영속 규칙은 문서에 둔다. ADR 없는 기술 변경은 완료로 보지 않는다.

## 참고
- 이슈 #7, #9 / `docs/adr/README.md` / `adr-management`·`issue-triage` 스킬.
