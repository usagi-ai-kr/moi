---
description: 단위 묶음 완료(전 PR merge·배포·smoke·이슈 close) Discord 알림 1회 전송
argument-hint: "[complete|blocked|failed] <제목>"
allowed-tools: Bash(node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs:*), Read
---

완성 알림 하네스를 실행한다 (이슈 #279, ADR-0075).

## 규칙
- **단위 묶음 완료**(전 PR merge + 배포 + smoke + 이슈 close)를 o가 판단한 경우에만 실행한다. **단위별 알림은 금지**(워커 중간 보고·리뷰 1건·재시도 반복 X).
- 상태는 사실을 그대로 쓴다: `complete` | `blocked` | `failed`.
- 1. 먼저 `--dry-run`으로 payload를 확인한다. 2. 확인 후 실제 전송한다(`--dry-run` 제거). **한 번만** 보낸다.
- webhook 값은 어떤 출력에도 남기지 않는다. 실패하면 blocker로 보고한다(merge를 되돌리지 않는다).

## 실행 (CWD = repo root)
```bash
# 1) payload 확인 (전송 없음)
node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs \
  --status complete --title "<제목>" --summary "<요약>" \
  --milestone <milestone> --version <version> --url <배포 URL> --commit <SHA> \
  --issue <번호> --test "<검증 항목>" --dry-run

# 2) 실제 전송 (--dry-run 제거, 위와 같은 인자)
node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs \
  --status complete --title "<제목>" --summary "<요약>" \
  --milestone <milestone> --version <version> --url <배포 URL> --commit <SHA> \
  --issue <번호> --test "<검증 항목>"
```

## 보고
- 종료 코드 0 = 전송 완료, 1 = 설정 오류, 2 = 사용법 오류, 3 = HTTP/네트워크 오류.
- 오류 시 stderr 메시지만 요약해 보고한다(webhook 원문은 출력되지 않는다). 사용법: `docs/harness/completion-notify.md`, 스킬: `orchestrator-completion-notify`.
