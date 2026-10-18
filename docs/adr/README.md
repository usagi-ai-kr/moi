# Architecture Decision Records (ADR)

moi의 **모든 기술적 추가 판단·변경**은 이 디렉터리에 ADR로 기록한다. (규칙: `AGENTS.md` 하네스·문서 관리, ADR-0010)

## 규칙
- 파일명: `NNNN-kebab-slug.md` (4자리 순차 번호). 제목은 한국어.
- 생성: `sh .agents/skills/adr-management/scripts/new-adr.sh <slug> "<제목>"` — `template.md` 기반으로 다음 번호가 자동 부여된다.
- 인덱스 갱신: `python3 .agents/skills/adr-management/scripts/adr-index.py` — 아래 표를 프런트매터에서 자동 재생성한다.
- 상태값: `Proposed`(제안) → `Accepted`(합의·적용) → `Deprecated`(폐기) 또는 `Superseded by ADR-NNNN`(대체됨).
- 기존 결정을 변경할 때: 기존 ADR 상태를 `Superseded by ADR-NNNN`으로 바꾸고 새 ADR을 추가한다. 기존 본문은 수정하지 않는다(오탈자 등 비의미 변경만 허용).
- 기능 구현 이슈에서 내린 기술 판단도 PR에서 ADR 추가/갱신 여부를 확인한다. ADR 없는 기술 변경은 완료로 보지 않는다.
- 우선순위: 최신 ADR > `AGENTS.md` > 스킬 세부 절차.

## 인덱스

<!-- ADR_INDEX:START -->
<!-- ADR_INDEX:END -->
