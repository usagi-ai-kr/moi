---
id: ADR-0075
title: 단위 묶음 완성 알림 — 공통 스크립트·스킬 기반 Discord webhook 1회 통지
status: Accepted
date: 2026-10-21
related: ["#279", "ADR-0010", "ADR-0015", "ADR-0023", "ADR-0042", "ADR-0051", "ADR-0062"]
---

# ADR-0075: 단위 묶음 완성 알림 — 공통 스크립트·스킬 기반 Discord webhook 1회 통지

## 배경
- 오케스트레이터의 작업 완료를 알리는 수단이 에이전트마다 달랐고, 단위별 알림이 반복되면 Discord 채널이 스팸처럼 보이면 알림을 끄게 된다.
- Claude Code·Codex·Agy·OpenCode가 같은 스크립트·스킬을 쓰지 않으면 "누가 보냈는지"와 "언제 보냈는지"를 추적할 수 없었다.
- webhook URL은 secret 이므로 로그·이슈·PR·CI 출력에 원문이 남으면 안 된다.

## 결정
- **단위 묶음 완료(전 PR merge + 배포 + smoke + 이슈 close) 판단 시 1회**만 Discord webhook embed로 통지한다. 단위별 알림은 금지한다.
- 통지는 **공통 스크립트 1개**로 한다: `.agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs` (Node 내장 fetch만 사용, 의존성 0). 4개 에이전트가 같은 명령을 호출한다(에이전트별 분기 코드 금지).
- 스킬은 Agent Skills 표준(`SKILL.md` + `scripts/`)을 따르고, 규칙은 `AGENTS.md`·`agent-orchestration` 스킬·`docs/harness/completion-notify.md`에 동기화한다. OpenCode·Claude Code는 프로젝트 명령(`.opencode/commands/complete.md`, `.claude/commands/complete.md`)으로 노출한다.
- webhook 해석 순서: 환경변수 `DISCORD_WEBHOOK` → `--env-path` → `MOI_ENV_FILE` → `.env`. env 파일은 **실행 없이 파싱**한다(셸 평가·command substitution 금지). `--env-file`은 Node 24 내장 옵션과 충돌하므로 `--env-path`를 사용한다. `--dry-run`은 webhook 미설정 상태에서도 payload 검토가 가능하다(target=`discord-webhook (unset)`).
- 실제 전송 URL은 `https://discord.com/api/webhooks/...`만 허용한다. 루프백 주소는 `MOI_NOTIFY_ALLOW_LOCAL=1`일 때만(테스트 전용) 허용한다.
- payload는 Discord embed 1개: 상태별 색(complete=green / blocked=yellow / failed=red), 필드(마일스톤·버전·커밋·배포 URL·이슈·검증), timestamp, footer. description 4096자·field 1024자·embed 6000자 한도를 넘으면 절단한다.
- 종료 코드로 원인을 구분한다: 0 성공, 1 설정·URL·필수값 누락, 2 사용법 오류, 3 HTTP·네트워크 오류. 429는 1회 재시도한다.
- webhook 원문·토큰은 stdout/stderr 어디에도 출력하지 않는다(`--dry-run`은 `target=discord-webhook (masked)`만 출력). `.env`는 커밋하지 않고 `.env.example`에 키만 둔다.
- **알림 실패는 merge를 되돌리지 않는다.** blocker로 보고하고 재전송한다.

## 결과
- 긍정: 4개 에이전트가 같은 스크립트·문서를 쓰므로 알림 형식·보안이 일관되고, secret 노출 경로가 스크립트 1곳에 모인다.
- 부정/제약: 실제 Discord 전송 증거는 0.2.4 완료 시 o가 판단해 1회 수행한다(워커는 mock·`--dry-run`만). 알림은 1회성이라 단위 중간 진행 상황은 Discord로 알리지 않는다. `AGENTS.md` 규칙 추가는 예산 상한(120줄·12KB) 안에서 **중복 제거·소개·출처 압축으로만** 반영했다(기존 규칙 문구는 보존, ADR-0015).

## 대안과 금지 사항
- 단위(워커)별 알림, 반복 재전송, 알림 실패를 사유로 merge 롤백 금지.
- 에이전트별 전용 전송 코드·플러그인 패키지 추가 금지(의존성 없는 프로젝트 명령 우선).
- 테스트에서 실제 Discord 호출 금지 — 로컬 mock HTTP 서버만 사용한다.
- webhook 원문을 stdout/stderr·이슈·PR·CI 로그에 남기는 구현 금지.

## 참고
- 이슈 #279, 스킬 `orchestrator-completion-notify`, `docs/harness/completion-notify.md`, `docs/adr/0075-orchestrator-completion-notify.md`.
