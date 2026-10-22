---
name: harness-eval-report
description: 하네스 회고 문서와 모델·하네스 평가 요약을 입력받아 usagi-ai-kr/usagi 저장소의 이슈 본문(한국어·평가 중심)을 만든다. 기본은 dry-run(본문과 게시 명령만 출력)이고 --post 를 명시할 때만 gh issue create 를 실행한다. 하네스 회고·평가 보고·usagi 이슈·모델 평가·하네스 평가·회고 보고서가 필요할 때 사용한다.
compatibility: gh CLI(--post 에서만 필요)·POSIX sh·awk·wc — repo root 에서 실행
---

# 하네스 회고·평가 → usagi 이슈 보고

## 언제 쓰나
- 하네스(스킬·ADR·게이트·큐) 변경 뒤 **모델·하네스 평가 보고**를 usagi 저장소 이슈로 올릴 때.
- 입력 2종: ① 회고 문서(마크다운) ② 평가 요약(마크다운). 경로로 준다.
- 출력: 이슈 본문(한국어). **기본은 dry-run** — 본문과 게시 명령만 출력하고 아무것도 올리지 않는다.

## 호출 (CWD = repo root)
```bash
# 1) 본문 생성·검토 (기본 dry-run — 네트워크 호출 없음)
sh .agents/skills/harness-eval-report/scripts/build-report.sh \
  --retro tmp/retro.md \
  --eval tmp/eval.md

# 2) 게시 (명시적 opt-in — 본문 검토 후에만)
sh .agents/skills/harness-eval-report/scripts/build-report.sh \
  --retro tmp/retro.md --eval tmp/eval.md --post
```
- 옵션: `--title`(기본 `하네스 회고·평가 보고 — <날짜>`)·`--repo`(기본 `usagi-ai-kr/usagi`)·`--out`(본문 파일 경로)·`--post`·`--dry-run`(기본값).
- 종료 코드: 0 생성(또는 게시 성공)·1 `gh` 실행 실패·2 사용 오류(입력 파일 없음 등).

## 본문 구성 (스크립트가 결정적으로 조합)
| 절 | 출처 | 폴백 |
| --- | --- | --- |
| `## 대상` | 저장소·입력 경로·생성 시각 | — |
| `## 모델 평가` | 평가 요약의 "모델" 제목 섹션 | 평가 요약 전체 |
| `## 하네스 평가` | 평가 요약의 "하네스" 제목 섹션 | 회고의 "효과/빈틈" 섹션 → 회고 전체 |
| `## 회고·개선 과제` | 회고의 "개선/과제/제안" 섹션 | 회고 전체 |

- 섹션 추출은 `##`~`###` 제목 기준(awk). 해당 제목이 없으면 표의 폴백을 쓴다 — 입력을 늘리면 스크립트 수정 없이 확장된다.
- 본문은 UTF-8 그대로(한국어). 60000바이트 초과 시 잘리고 잘림 사실을 표시한다.

## 규칙
- **기본 dry-run** — `gh issue create` 는 `--post` 로 명시할 때만 실행한다. 검토 없이 게시 금지.
- **비밀값 금지** — 토큰·webhook·답안 원문·사용자 식별자를 본문·이슈에 넣지 않는다(ADR-0006).
- **평가 중심** — 무엇을 했고, 모델과 하네스가 각각 어떻게 평가받았고, 다음에 무엇을 바꿀지를 쓴다. 구현 상세 diff 는 이슈가 아니라 PR 에 둔다.
- **공개 확인 가능한 근거** — 커밋 SHA·PR 번호·게이트 로그 경로를 본문에 명시한다.
- **한국어** — 제목·본문 모두 한국어(모델·하네스 용어는 원문 유지).

## 검증
- `node .agents/scripts/validate-skills.mjs` — 스킬 표준·scripts/ 존재·AGENTS.md 인덱스 통과.
- `node .agents/skills/harness-budget/scripts/check-module-lengths.mjs` — SKILL.md 120줄/12288바이트 이내.
- 자체 점검: 임시 마크다운 2개로 `--dry-run` 실행 → 두 입력이 본문에 반영됐는지, gh 호출 없이 본문·게시 명령만 출력되는지 확인.

## 참고
- 관련 스킬: `harness-budget`(예산)·`adr-management`(판정 기록)·`agent-orchestration`(콜백)·`orchestrator-completion-notify`(알림).
- 근거 ADR: ADR-0010(문서 관리)·ADR-0075(알림 규칙)·ADR-0006(로그·시크릿 정책).
- 입력 예시: `tmp/` 산출물(단위 보고서·리뷰·평가 요약).
