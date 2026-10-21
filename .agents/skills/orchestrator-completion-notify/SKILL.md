---
name: orchestrator-completion-notify
description: 단위 묶음(전 PR merge·배포·smoke·이슈 close) 완료 시 Discord 완성 알림을 1회 보내는 moi 하네스 스킬·스크립트. Claude Code·Codex·Agy·OpenCode가 같은 스크립트·스킬로 호출한다. 완성 알림·Discord 알림·완성 notify·notify-completion·단위 묶음 완료 통지가 필요할 때 사용. 단위별 알림은 금지.
compatibility: Node.js 22+ (내장 fetch) 필요. .env 또는 MOI_ENV_FILE의 DISCORD_WEBHOOK 설정 필요.
---

# 완성 알림 — 단위 묶음 완료 Discord 통지

출처: 이슈 #279, ADR-0075. 관련: `agent-orchestration`, `adr-management`.

## 언제 보내고 언제 보내지 않는가
- **보내는 경우**: o가 단위 묶음 완료(모든 PR merge + 배포 + smoke + 이슈 close)를 판단한 직후 **1회**.
- **보내지 않는 경우**: 워커 단위 중간 보고, 리뷰 1건, 단위별 완료, 재시도 반복, merge 전 확인, `--dry-run` 확인. **단위별 알림은 금지** — 자주 오면 Discord를 끄게 되어 알림의 가치가 사라진다.
- **보내는 주체**: o만. 워커(w)·리뷰어(r)는 `--dry-run`으로 payload만 확인하고 실제 전송하지 않는다.
- **상태**: `complete`(완료) · `blocked`(차단) · `failed`(실패). 완료가 아니면 status를 사실대로 쓴다.

## 호출 (CWD = repo root)
1. 먼저 payload만 확인한다(전송 없음):
   ```bash
   node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs \
     --status complete --title "0.2.4 학습 실사용" --summary "PR 전부 merge·배포·smoke 통과" \
     --milestone 0.2.4 --version 0.2.4 --url https://moi.example.workers.dev --commit abc1234 \
     --issue 279 --test "lint·typecheck·test:unit" --dry-run
   ```
2. payload를 확인한 뒤 o가 실제 전송한다(`--dry-run` 제거):
   ```bash
   node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs \
     --status complete --title "0.2.4 학습 실사용" --summary "PR 전부 merge·배포·smoke 통과" \
     --milestone 0.2.4 --version 0.2.4 --url https://moi.example.workers.dev --commit abc1234 \
     --issue 279 --test "lint·typecheck·test:unit"
   ```
   - `--issue` · `--test`는 반복 지정 가능. `--env-path <path>`로 env 파일을 바꿀 수 있다(기본 `.env`). 빈 값은 무시한다.
   - 4개 에이전트(Claude Code·Codex·Agy·OpenCode) 모두 **같은 스크립트**를 호출한다. 전용 분기 코드를 만들지 않는다.

## 인자
| 옵션 | 설명 |
| --- | --- |
| `--status` | `complete` \| `blocked` \| `failed` (필수) |
| `--title` | 알림 제목 (필수) |
| `--summary` | 본문 요약 (embed description) |
| `--milestone` / `--version` | 마일스톤·버전 표기 |
| `--url` | 배포 URL |
| `--commit` | 커밋 SHA |
| `--issue` / `--test` | 이슈 번호·검증 항목 (반복 가능) |
| `--dry-run` | 전송 없이 payload만 출력 |
| `--env-path` | env 파일 경로(기본 `.env`) |

## 종료 코드와 실패 처리
| 코드 | 의미 | 대응 |
| --- | --- | --- |
| 0 | 성공(또는 `--dry-run` 성공) | — |
| 1 | 설정 오류(webhook 누락·형식 오류·필수값 누락) | `.env`의 `DISCORD_WEBHOOK` 확인 후 재시도 |
| 2 | 사용법 오류(알 수 없는 옵션·잘못된 status) | 인자 확인 |
| 3 | HTTP·네트워크 오류 | 상태 코드 확인, 재시도(429는 스크립트가 1회 재시도) |

- **알림 실패는 merge를 되돌리지 않는다.** blocker로 보고(o·이슈·PR에 남김)하고 수동 재전송한다.
- stderr·stdout에는 webhook 원문·토큰이 절대 나오지 않는다. 오류 메시지를 그대로 PR에 붙여도 안전하다.

## 보안
- `DISCORD_WEBHOOK`은 **실행 없이 파싱**한다(셸 평가·command substitution 없음). 해석 순서: 환경변수 → `--env-path` → `MOI_ENV_FILE` → `.env`. 지정한 env 파일이 없으면 fail-closed(exit 1)다. `--dry-run`은 webhook 미설정이어도 payload 검토가 가능하다(`target=discord-webhook (unset)`).
- 실제 전송 URL은 `https://discord.com/api/webhooks/...`만 허용. 로컬 주소는 `MOI_NOTIFY_ALLOW_LOCAL=1`일 때만(테스트 전용).
- `.env`는 커밋하지 않는다(`.env.example`에 키만 둔다). webhook 값은 이슈·PR·CI 로그에 남기지 않는다.

## 스크립트
- `node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs` — 알림 전송(의존성 없음, Node 내장 fetch).
- `node --test .agents/skills/orchestrator-completion-notify/scripts/notify-completion.test.mjs` — 회귀 테스트(mock HTTP, 실제 Discord 호출 없음).
- 사용법·에이전트별 예시·트러블슈팅: `docs/harness/completion-notify.md`.
