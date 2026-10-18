---
name: adr-management
description: moi의 기술적 판단·변경을 ADR(Architecture Decision Record)로 기록·갱신하는 절차. 새 ADR 작성, 상태 변경(Superseded), docs/adr 인덱스 자동 갱신, ADR 번호·템플릿 관리가 필요할 때 사용. 모든 기술 결정은 ADR로 관리한다.
compatibility: sh와 python3 필요 (scripts/new-adr.sh, scripts/adr-index.py).
---

# ADR 관리 — 기술적 판단·변경의 기록

출처: 사용자 확정 사항(2026-10-18), ADR-0010. 규칙 요약은 `AGENTS.md` 하네스·문서 관리.

## 스크립트 (우선 실행 — repo root에서 실행)
- `sh .agents/skills/adr-management/scripts/new-adr.sh <kebab-slug> "<한국어 제목>"` — 다음 번호로 `docs/adr/NNNN-slug.md` 생성(template.md 기반).
- `python3 .agents/skills/adr-management/scripts/adr-index.py [adr-dir]` — 프런트매터(id/title/status/date)를 파싱해 `docs/adr/README.md` 인덱스 표를 자동 재생성. 출력 요약만 읽는다.

## 언제 ADR을 쓰는가
- 새 기술 결정(스택·패턴·보안·운영)이 생겼을 때.
- 기존 결정을 변경할 때.
- 이슈에서 확정된 기술 판단을 문서로 승격할 때.
- **ADR 없는 기술 변경은 완료로 보지 않는다** (PR에서 추가/갱신 여부 확인).

## 절차
1. 생성: `sh .agents/skills/adr-management/scripts/new-adr.sh <kebab-slug> "<한국어 제목>"` → `docs/adr/NNNN-slug.md`
2. 본문 작성: 배경 / 결정 / 결과(긍정·부정) / 대안과 금지 사항 / 참고. 제안 단계면 `Proposed`, 합의되면 `Accepted`.
3. 인덱스 갱신: `python3 .agents/skills/adr-management/scripts/adr-index.py`
4. 기존 결정 변경 시: 기존 ADR 상태를 `Superseded by ADR-NNNN`으로 바꾸고(본문 보존, 오탈자 제외 수정 금지) 새 ADR을 작성한다.
5. 같은 PR에서 `AGENTS.md`/스킬에 영향이 있으면 동기화한다.

## 상태값
`Proposed` → `Accepted` → `Deprecated` 또는 `Superseded by ADR-NNNN`

## 참고
- 표준 Agent Skills 형식을 따른다(스킬 자체는 표준, ADR 문서는 `docs/adr/README.md` 규칙).
- 검증: `node .agents/scripts/validate-skills.mjs` (스킬 표준 점검).
