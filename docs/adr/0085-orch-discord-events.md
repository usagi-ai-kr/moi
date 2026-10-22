---
id: ADR-0085
title: 오케스트레이터 Discord 알림 이벤트 확장 — intervention·confirmation·deliverable
status: Accepted
date: 2026-10-21
related: ["#279", "ADR-0075", "ADR-0042", "ADR-0084"]
---

# ADR-0085: 오케스트레이터 Discord 알림 이벤트 확장 — intervention·confirmation·deliverable

## 배경
- ADR-0075는 단위 묶음 완료 1회 통지만 정의했다. 오케스트레이터(o)가 사용자 개입·확인·산출물 도달을 놓치지 않도록 같은 채널에 추가 이벤트가 필요했다.
- 에이전트 훅(Claude Code Notification/PreToolUse)에서 자동으로 알림을 보내되, 단위별·중간 진행 알림 금지(ADR-0075)는 유지해야 한다.

## 결정
- 기존 `notify-completion.mjs`를 확장해 `--event` 옵션을 추가한다. 기본값은 `completion`으로 하위호환한다. 의존성은 Node 내장 fetch만 사용한다.
- 이벤트 종류: `completion`(기존 complete/blocked/failed 유지), `intervention`(사용자 개입 필요), `confirmation`(사용자 확인 요청), `deliverable`(요청 산출물 도달).
- `--from-hook` 모드에서 stdin JSON의 `message` 필드를 사용한다. PreToolUse 입력 구조는 가정하지 않고 안전 파싱하며, 필드가 없거나 파싱 실패 시 일반 문구로 대체한다.
- 트리거: Notification 훅 matcher `permission_prompt|idle_prompt` → intervention. PreToolUse matcher `AskUserQuestion` → confirmation. deliverable은 o가 명시 호출한다.
- 훅은 공유 `.claude/settings.json`이 아닌 o 전용 `.claude/settings.local.json`(비추적)에 둔다. 저장소에는 스니펫만 `docs/harness/completion-notify.md`에 기록한다. `.gitignore`에 `.claude/settings.local.json`을 추가한다.
- **훅 모드 exit 0 (B1)**: `--from-hook` 모드는 인자·설정·HTTP·stdin 읽기 모든 실패 경로에서 exit 0으로 종료한다. 훅 모드 판별은 `--from-hook`·`--from-hook=...` 두 형태를 모두 포함한다(인자가 잘못돼도 exit 2로 도구 호출을 막지 않는다). 오류는 stderr 한 줄 요약만 출력하고 redaction을 유지한다. PreToolUse 훅 exit 2가 `AskUserQuestion` 호출을 차단하는 것을 방지한다. 회귀 테스트로 고정한다.
- **훅 스니펫 경로 (B2)**: 스니펫 command는 `$CLAUDE_PROJECT_DIR` 기준 절대 경로를 사용하고 `--env-path "$CLAUDE_PROJECT_DIR/.env"`를 포함한다. 훅 cwd가 worktree로 바뀌어도 상대 경로·`.env` 조회가 실패하지 않는다. 스니펫 JSON 유효성·경로 규칙을 테스트로 고정한다.
- 금지 규칙 유지: 단위별·중간 진행 알림 금지(ADR-0075), 워커는 `--dry-run`만 사용한다. 알림 실패는 merge를 되돌리지 않는다.

## 결과
- 긍정: o가 사용자 개입·확인·산출물 도달을 놓치지 않고, 기존 완료 알림과 같은 보안·형식을 재사용한다.
- 부정/제약: 훅 자동 호출은 o 전용 설정에 의존하므로 설정 누락 시 알림이 오지 않는다. 색·문구는 이벤트별로 구분된다.

## 대안과 금지 사항
- 공유 `.claude/settings.json`에 훅 추가 금지(모든 사용자/워커에 영향).
- 워커·리뷰어의 실제 전송 금지(`--dry-run`만).
- 단위별·중간 진행 알림 금지(ADR-0075 유지).
- ADR-0075 본문 수정 금지(참조만).

## 참고
- 이슈 (미연결, PR 전 o가 연결), 스킬 `orchestrator-completion-notify`, `docs/harness/completion-notify.md`, ADR-0075.