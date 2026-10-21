# 완성 알림 하네스 — 단위 묶음 완료 Discord 통지

출처: 이슈 #279, ADR-0075. 스킬: `.agents/skills/orchestrator-completion-notify/`.

## 규칙 요약
- **단위 묶음 완료**(전 PR merge + 배포 + smoke + 이슈 close)를 **o가 판단한 직후 1회**만 보낸다.
- **단위별 알림은 금지**(워커 중간 보고·리뷰 1건·재시도 반복 X). 자주 오면 채널을 끄게 된다.
- 알림 실패는 merge를 되돌리지 않는다. blocker로 보고하고 재전송한다.
- 워커(w)·리뷰어(r)는 `--dry-run`으로 payload만 확인한다. 실제 전송은 o만 한다.

## 환경 설정
| 항목 | 설명 |
| --- | --- |
| `DISCORD_WEBHOOK` | `https://discord.com/api/webhooks/{id}/{token}` — **secret**. 채팅 채널 설정 → Integrations → Webhooks → Copy URL |
| 저장 위치 | repo root `.env` (gitignore 대상). `.env.example`에는 키만 둔다 |
| 다른 파일 | `MOI_ENV_FILE=/path/to/env` 로 대체 가능 |
| 우선순위 | 환경변수 `DISCORD_WEBHOOK` → `--env-path` → `MOI_ENV_FILE` → `.env` |

env 파일은 **실행 없이 파싱**한다(`KEY=VALUE`만 읽고, 셸 평가·command substitution 없음).

## 공통 호출 (CWD = repo root)
```bash
# 1) payload만 확인 (전송 없음)
node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs \
  --status complete \
  --title "0.2.4 학습 실사용" \
  --summary "전 PR merge·배포·smoke 통과, 이슈 #279 close" \
  --milestone 0.2.4 --version 0.2.4 \
  --url https://moi.qus0in.workers.dev \
  --commit abc1234 \
  --issue 279 --issue 127 \
  --test "lint·typecheck·test:unit" \
  --dry-run

# 2) o가 확인한 뒤 실제 전송 (--dry-run 제거)
node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs \
  --status complete --title "0.2.4 학습 실사용" --summary "전 PR merge·배포·smoke 통과" \
  --milestone 0.2.4 --version 0.2.4 --url https://moi.qus0in.workers.dev --commit abc1234 \
  --issue 279 --test "lint·typecheck·test:unit"
```
- `--status`: `complete` | `blocked` | `failed`
- `--issue` · `--test`: 반복 지정 가능
- `--dry-run` 출력: `target=discord-webhook (masked)` + payload JSON (webhook 원문 없음)

## 에이전트별 사용법
| 에이전트 | 방법 |
| --- | --- |
| OpenCode | `/complete` 명령 → `.opencode/commands/complete.md` 가 스크립트 호출 지침을 준다 |
| Claude Code | `/complete` 명령 → `.claude/commands/complete.md` 동일 지침 |
| Codex | `AGENTS.md` + 이 문서 + 스킬을 읽고 위 스크립트를 직접 실행 |
| Agy | `AGENTS.md` + 이 문서 + 스킬을 읽고 위 스크립트를 직접 실행 |

4개 에이전트는 **같은 스크립트·같은 인자**를 쓴다. 에이전트 전용 분기 코드는 만들지 않는다.

## payload 예시 (`--dry-run` 출력)
```json
{
  "embeds": [
    {
      "title": "0.2.4 학습 실사용",
      "description": "전 PR merge·배포·smoke 통과, 이슈 #279 close",
      "color": 4619907,
      "fields": [
        { "name": "마일스톤", "value": "0.2.4", "inline": true },
        { "name": "버전", "value": "0.2.4", "inline": true },
        { "name": "커밋", "value": "abc1234", "inline": true },
        { "name": "배포 URL", "value": "https://moi.qus0in.workers.dev", "inline": false },
        { "name": "이슈", "value": "279, 127", "inline": false },
        { "name": "검증", "value": "lint·typecheck·test:unit", "inline": false }
      ],
      "timestamp": "2026-10-21T12:00:00.000Z",
      "footer": { "text": "moi · 완료" }
    }
  ]
}
```
- 색: complete=green(0x2ecc71) · blocked=yellow(0xf1c40f) · failed=red(0xe74c3c)
- 한도: description 4096자 · field 값 1024자 · embed 합계 6000자 — 초과 시 자동 절단(`…`)

## 종료 코드
| 코드 | 의미 | 대응 |
| --- | --- | --- |
| 0 | 성공(또는 dry-run 성공) | — |
| 1 | 설정 오류(webhook 누락·형식 오류·필수값 누락) | `.env` 의 `DISCORD_WEBHOOK` 확인 |
| 2 | 사용법 오류(알 수 없는 옵션·잘못된 status) | 인자 확인 |
| 3 | HTTP·네트워크 오류 | 상태 코드 확인(429는 스크립트가 1회 재시도) |

## 보안
- webhook URL·토큰은 stdout/stderr·이슈·PR·CI 로그에 남기지 않는다. 오류 메시지는 그대로 붙여도 안전하다.
- `.env`는 커밋 금지(`.gitignore` 대상). `.env.example`에는 `DISCORD_WEBHOOK=` 키만 둔다.
- 실제 전송 URL은 `https://discord.com/api/webhooks/...`만 허용. 루프백은 `MOI_NOTIFY_ALLOW_LOCAL=1`일 때만(테스트 전용).
- 테스트는 로컬 mock HTTP 서버만 사용한다 — 실제 Discord 호출 금지.

## 트러블슈팅
| 증상 | 원인·대응 |
| --- | --- |
| exit 1 + `DISCORD_WEBHOOK 설정이 없습니다` | `.env` 위치(CWD=repo root) 또는 `MOI_ENV_FILE` 확인. 환경변수 우선이므로 stale 환경변수를 지운다 |
| exit 1 + `환경 파일을 찾을 수 없습니다` | `--env-path`/`MOI_ENV_FILE` 경로 오류 — 지정한 파일이 없으면 fail-closed(다른 파일로 fallback 하지 않음) |
| exit 1 + `webhook URL 형식 오류` | `https://discord.com/api/webhooks/{id}/{token}` 형식 확인(구 도메인 `discordapp.com`은 불가) |
| exit 1 + `로컬 webhook은 MOI_NOTIFY_ALLOW_LOCAL=1 일 때만` | 테스트 전용 플래그 필요. 운영에서는 루프백 URL 금지 |
| exit 3 + `HTTP 401/404` | webhook 삭제·토큰 회전 여부 확인. 채널 설정에서 새 URL 발급 |
| exit 3 + `HTTP 429` | 1회 자동 재시도됨. 계속 실패하면 몇 초 뒤 재전송(중복 알림은 단위별 알림이 아님) |
| exit 3 + 네트워크 오류 | 사내 프록시·방화벽 확인. `--env-path` 경로가 다른 환경의 값을 가리키는지 확인 |

## 검증
```bash
node --test .agents/skills/orchestrator-completion-notify/scripts/notify-completion.test.mjs
node .agents/scripts/validate-skills.mjs
node .agents/skills/harness-budget/scripts/check-module-lengths.mjs
```
테스트는 dry-run 무전송·payload 필드/절단·webhook 누락/형식 오류·mock 204/500/429·비밀 비노출을 로컬 mock 으로 검증한다.
