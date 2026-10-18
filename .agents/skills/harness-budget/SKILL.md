---
name: harness-budget
description: 하네스 모듈(AGENTS.md·SKILL.md·ADR)의 길이 예산 검사·관리 절차. 모듈이 비대해질 때, 예산 초과를 해소하거나 예산을 조정할 때, CI 드리프트 확인이 필요할 때 사용. 상한 초과는 CI에서 차단(fail-closed).
compatibility: Node.js만 필요(외부 의존성 없음) — scripts/check-module-lengths.mjs.
---

# 하네스 모듈 길이 예산 — 검사·관리

출처: 이슈 #38, ADR-0013. 관련: `adr-management`, `issue-triage`.

## 스크립트 (repo root에서 실행)
- `node .agents/skills/harness-budget/scripts/check-module-lengths.mjs` — AGENTS.md·SKILL.md·ADR(README 제외)의 줄/바이트/추정토큰을 예산과 비교해 요약 테이블 출력. `--json`으로 기계 판독 출력.
- 종료 코드: 0 예산 이내(경고 가능) · 1 상한 초과 · 2 설정 오류.

## 예산 (단일 설정: `scripts/budgets.json`)
| 모듈 | 목표 | 상한 | 근거 |
| --- | --- | --- | --- |
| `AGENTS.md` | 110줄 | 120줄 / 12KB | 항상 로드 — 가장 엄격 |
| `.agents/skills/*/SKILL.md` | 90줄 | 120줄 / 12KB | 트리거 시 로드(표준 500줄 권장보다 강화) |
| `docs/adr/*.md` (README 제외) | 40줄 | 60줄 / 4KB | 결정 1건 — 선택 열람 |

추정토큰 = bytes/3(한글 중심 보수 추정). 목표 초과는 경고, 상한 초과는 실패다.

## 초과 시 해소 절차
1. 중복·군더더기 제거 — 다른 문서와 겹치는 서술, 현재 상태 나열 삭제.
2. 반복·결정적 절차는 스크립트로 코드화 — 문서에는 호출 한 줄과 요약만 남긴다.
3. 상세는 별도 문서(ADR·docs)로 분리하고 링크만 유지.
4. 예산 자체를 바꾸려면 ADR-0013을 갱신(supersede)하고 같은 PR에서 `budgets.json`을 수정한다.

## CI
- `.github/workflows/ci.yml`의 "Check harness module budgets" 스텝이 항상 실행된다(fail-closed).
- PR에는 검사 요약(모듈 수·초과/경고)을 기록한다.
