# 오케스트레이션 상세 절차 — SLA 판정·위임·콜백

규칙 요약은 `.agents/skills/agent-orchestration/SKILL.md` 에 있고, 이 문서는 **상세 절차·예시·운영 표**를 담는다. 두 문서가 어긋나면 SKILL.md 규칙을 우선하고 이 문서를 갱신한다.

출처: 이슈 #338·#339·#340, ADR-0023(컨텍스트 리셋·산출물 검증), ADR-0042(역할·콜백), ADR-0051(정지·인계), ADR-0085(Discord 이벤트).

## 1. SLA 초과 판정 (작업 5분 / 리뷰 10분)

- 초과는 **단 난이도가 아니라 패널 상태**로 본다. o가 판단을 요청할 때 초과 시각·관측된 증상을 함께 적는다.
- 초과는 아래 4분류로 **먼저 분류**하고, 분류에 맞는 조치만 한다(재시작·재배정·사용자 확인이 섞이지 않게).

| 분류 | 징후 | 조치 |
| --- | --- | --- |
| 1. 오케스트레이션 실패 | 브리프 모호·권한 없음·판단 요청 누락·패널 미배정 | 브리프를 좁혀 **같은 모델·신규 세션**으로 재디스패치 |
| 2. 워커 능력 | 요구사항 오판·반복 실패 | 더 강한 모델로 **재배정**(모델 교체는 §3 승인 절차) |
| 3. 외부 | 제공자 오류·429/5xx·네트워크·원격 API 지연 | 재시도 1회 → 실패 시 다른 모델/제공자 경로로 재배정하고 blocker 보고 |
| 4. 오차 | 파일 위치·명령어·조사 부족 등 단순 실수 | 같은 워커에 동일 브리프로 1회 재시도(컨텍스트 리셋) → 2회 실패 시 2번으로 승격 |

### 유휴 패널 즉시 재배정
- 콜백을 보낸 패널·blocked/failed 로 끝난 패널은 즉시 대기 상태이므로 o는 다음 단위를 그 패널에 배정한다.
- 브리프·worktree·금지 파일을 명시하고 **새 단위 전용 세션**에서 시작한다(맥락 혼입 금지).
- 같은 worktree·브랜치를 두 패널에 동시에 배정하지 않는다.

### 정기 점검(5분 harness-watch)
- 콜백 대기 구간에서 5분마다 1회: `sh .agents/skills/agent-orchestration/scripts/harness-watch.sh [queue.tsv] [callbacks.log]`
- 점검은 **쓰기 없는 보고 전용**이며 상시 폴링 루프를 만들지 않는다(대기 구간에만 둔다).
- OVERDUE 는 §1 표로 판정하고 그때 재시도·재배정을 결정한다.

## 2. o 응대 원칙 (서브에이전트 위임)

- o는 **1분 안에 응답 가능한 상태**를 유지한다. 긴 보고서 판정·지시 초안 작성은 직접 하지 않는다.
- 허용 위임: 보고서 판정·다음 지시 초안만. `callback-triage` 에이전트(`.claude/agents/callback-triage.md`)를 **백그라운드**(`run_in_background`)로 호출하고 결과를 기다리지 않는다.
- 위임 금지: 디스패치 실행(herdr 프롬프트), 커밋·PR·병합·배포, 콜백 기록 변경, 새 에이전트 생성. 이들은 o 직접 또는 워커가 수행한다.
- 보고서가 1건이고 status 한 줄로 충분하면 o가 직접 판단해도 된다. 2건 이상이거나 본문 50줄 초과면 위임한다.
- 위임 결과가 도착하면 o가 반영하고 `tmp/callbacks.log`에 처리 기록을 남긴다.

## 3. 패널 판단·모델 운영

- **판단 요청에는 각 모델의 성능·경향 요약을 함께 제시한다.** 요약에는 각 모델의 강점·약점(속도·정확도·장문 맥락 유지 등)을 1줄씩 적는다.

| 패널 | 모델 | 강점 | 약점 |
| --- | --- | --- | --- |
| `codex-gpt-luna` | GPT-6-Luna(max) | 장문·횡단 추론, 리뷰 깊이 | 상대적으로 느림 |
| `codex-gpt-2` | GPT-6-Luna(max) | 위와 동일 | 위와 동일 |
| `oc-minimax-flash` | MiniMax M3.1 Flash | 빠른 결정적 작업·반복 수정 | 맥락 유지·미세 판단 |
| `oc-beam-free` | Beam Free | 범용 구현·테스트 작성 | 심층 분석 한계 |

- 패널이 바뀌면 이 표를 갱신한다(표는 시점 스냅샷).
- **워커 추가·모델 교체는 판단 요청 → 사용자 승인 후 실행.** 승인 없이 새 패널을 만들거나 모델을 바꾸지 않는다. 교체가 승인·실행되면 아래 명령으로 Discord 통지를 1회 보낸다(단위별 알림 아님):
  ```bash
  node .agents/skills/orchestrator-completion-notify/scripts/notify-completion.mjs \
    --event confirmation --title "<교체 내용>" --summary "<모델·패널·사유>"
  ```
- **effort(추론 강도)는 o가 임의로 변경할 수 있다.** 기본은 **전 패널 max 또는 변경 불가** 상태를 유지하고, 낮추려면 판단 요청에 근거를 적어 승인받는다. effort 조정은 산출물 품질 차이로 기록하지 않는다.

## 4. 콜백 프로토콜 상세

- 형식: `[callback] unit=<unit> status=<done|blocked|failed> report=<path>`
- 전송: `sh .agents/skills/agent-orchestration/scripts/notify.sh o <unit> <status> <report>` (콜백 대상 기본값은 `o`, 패널 ID 직접 지정은 예외).
- 기록 순서: `<MOI_WORK_DIR|보고서 디렉터리>/callbacks.log`에 먼저 기록 → `herdr agent prompt`로 전송.
- 전송 실패: `delivered=pending`으로 남기고 종료 0이며, o가 재전송한다. `--dry-run`은 기록·전송 없이 출력만 한다.
- o는 콜백을 받으면 보고서를 읽고 다음 단위를 디스패치한다. 같은 unit의 중복 콜백은 최신 status로 처리한다.
- 예시:
  ```bash
  # 워커가 완료 보고
  sh .agents/skills/agent-orchestration/scripts/notify.sh o 327-pr done tmp/report-327-pr.md
  # o가 미수신 콜백 확인 후 재전송
  grep 'delivered=pending' tmp/callbacks.log
  sh .agents/skills/agent-orchestration/scripts/notify.sh o 327-pr done tmp/report-327-pr.md
  ```

## 5. 작업 정지·인계 순서 (ADR-0051)

1. 패널별 중지 프롬프트(테스트·서버 종료, 미커밋 보존, 3줄 상태 응답 후 대기)
2. 폴백 타이머 해제
3. 브랜치·SHA·미커밋·잔여 프로세스 확인
4. `tmp/handover-<날짜>.md` 작성 후 인계 이슈(`tuck`, 현재 Milestone)에 게시(다음 o 재개 프롬프트 포함)
5. 미커밋 워커 변경은 버리지 않고 `wip:` 커밋으로 보존하며 게이트 미검증을 표시

- 인계 문서는 `docs/`에 두지 않고, 남겨야 할 내용은 이슈로 처리한다.
- 브리프·보고서·콜백 로그는 메인 저장소 `tmp/`의 절대 경로로 전달한다(gitignore, `.gitkeep`만 커밋). worktree의 `tmp/`·`$TMPDIR`는 쓰지 않는다.

## 런타임 비종속 오케스트레이션

결정 기록은 [ADR-0088](../adr/0088-orchestration-runtime-adapters.md), 역할·검증 규칙은 [agent-orchestration 스킬](../../.agents/skills/agent-orchestration/SKILL.md)을 따른다.

## 구조

```mermaid
flowchart LR
  W[워커 w] -->|notify.sh / cli enqueue| I[(내구 인박스 JSONL)]
  I --> D[daemon]
  D -->|isIdle(o), send(o, batch)| A{roles.json의 o adapter}
  A --> H[herdr adapter]
  A --> F[file adapter]
  H --> T[설정된 런타임 target]
  F --> X[인박스 파일 소비 런타임]
  D -->|성공 시 delivered 레코드 append| I
```

역할은 `o`(디스패치·수락), `w`(구현), `r`(리뷰)다. 런타임이나 패널 이름은 역할 설정에서 adapter의 target으로 연결하며, 스크립트·문서의 처리 로직에는 고정하지 않는다.

## 역할 설정

저장 위치는 `.agents/orchestration/roles.json`이다. o에는 단일 adapter/target을 연결하고, w와 r에는 사용할 구현·리뷰 대상 설정을 배열로 둔다.

```json
{
  "o": { "adapter": "herdr", "target": "<configured target>" },
  "w": [{ "adapter": "herdr", "target": "<configured target>" }],
  "r": [{ "adapter": "herdr", "target": "<configured target>" }]
}
```

런타임 target은 이 파일에서만 설정한다. 역할명을 바꾸지 않고 설정의 adapter/target을 바꾸면 전달 런타임을 전환할 수 있다.

## 내구 인박스와 콜백

`tmp/inbox/*.jsonl`은 enqueue된 메시지와 전달 상태를 append-only로 저장한다. 레코드 필드는 `id`, `ts`, `to`, `kind`, `unit`, `status`, `report`, `delivered`다. 같은 id가 여러 번 기록되면 최신 레코드가 현재 상태다. `delivered=false`인 메시지는 pending으로 남겨 재시도한다.

기존 호출 위치 인자를 유지한다. `notify.sh <configured-o-target> <unit> <done|blocked|failed> <report>`는 인박스에 기록하고, 호환을 위해 `callbacks.log`에도 기록한다. o adapter가 전달에 성공한 뒤에만 delivered를 갱신한다. `--dry-run`은 기록·전달하지 않는다.

## 어댑터 추가

어댑터 인터페이스는 `isIdle(role)`과 `send(role, text)`다. 기존 런타임 연결은 설정된 target으로 상태 확인과 메시지 전달을 수행한다. `file` 어댑터는 런타임 프로세스를 직접 실행하지 않고 인박스 파일을 전달 경계로 사용하므로 어느 런타임에서든 읽을 수 있다.

새 adapter는 `.agents/skills/agent-orchestration/scripts/orch/adapters/<name>.mjs` 파일 하나를 추가하고, 동일 인터페이스를 구현한 뒤 roles 설정에서 선택한다. daemon과 inbox 스키마는 adapter별 분기 없이 유지한다. 전달 실패는 delivered 상태를 갱신하지 않아 재시도 가능해야 한다.

## CLI와 daemon

CWD는 저장소 root다. `cli.mjs`는 enqueue/list-pending/ack 동작을 제공한다. daemon은 interval마다 o행 pending을 묶어 검사하고, o adapter가 idle일 때 전달한다. busy 또는 전송 실패는 pending으로 유지한다. `--once`는 한 회차만 처리하며 `--roles`, `--inbox`로 설정 경로를 바꿀 수 있다.

수동 1회 실행:

```sh
node .agents/skills/agent-orchestration/scripts/orch/daemon.mjs \
  --once \
  --roles .agents/orchestration/roles.json \
  --inbox tmp/inbox
```

pm2 장기 실행 예:

```sh
pm2 start .agents/skills/agent-orchestration/scripts/orch/daemon.mjs \
  --name moi-orchestration \
  -- --interval 5000 \
  --roles .agents/orchestration/roles.json \
  --inbox tmp/inbox
pm2 save
```

daemon의 주기 확인은 내구 인박스 전달·재시도용이다. 워커의 완료 여부는 메시지의 callback 레코드로 판단하며, 런타임 화면이나 작업 세션의 종료 추측으로 대체하지 않는다.
