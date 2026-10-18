---
id: ADR-0009
title: 브랜치·PR 플로우
status: Accepted
date: 2026-10-18
related: ["#13", "#5"]
---

# ADR-0009: 브랜치·PR 플로우

## 배경
- 에이전트·사용자가 같은 저장소에서 작업하므로 변경이 항상 리뷰·CI를 거치도록 하는 보호 장치가 필요하다.

## 결정
- `main`: 안정/배포 브랜치. 직접 push 금지. `dev` → `main` PR(merge commit)로만 반영한다.
- `dev`: 통합 브랜치. 기능 브랜치는 `dev`에서 분기해 `dev`로 PR한다(squash merge, 병합 후 브랜치 삭제). 필요 시 `main`→`dev` 역방향 동기화 PR을 merge commit으로 수행한다.
- 브랜치 이름: `<type>/<버전 또는 이슈 번호>-<요약>` (소문자 kebab-case). type ∈ `feat`/`fix`/`chore`/`docs`/`test`. 예: `feat/0.1.1-kakao-oidc`, `fix/12-cookie-path`, `docs/9-harness-doc-sync`.
- 모든 병합은 PR로만 한다. PR에는 테스트 위치/명령/결과, 배포 URL(해당 없음 허용), commit SHA, 남은 blocker를 기록한다.
- `main`/`dev` force push·브랜치 삭제 금지. GitHub 브랜치 보호 규칙으로 강제하며, 미설정 환경에서는 수동 준수한다(보호 설정은 #13).
- CI: 모든 PR(main/dev 대상)과 dev push에서 실행한다.

## 결과
- 긍정: 변경 이력·증거가 PR에 남고 `main`은 배포 가능 상태를 유지한다.
- 부정/제약: 소규모 변경에도 PR 2단계(기능→dev, dev→main) 비용. 역방향 동기화 PR 규칙이 필요하다(위 결정).

## 대안과 금지 사항
- main 직접 push, force push, 보호 규칙 없는 운영 — 금지.

## 참고
- 이슈 #13 / `AGENTS.md` 브랜치·PR 플로우 / 사용자 확정(2026-10-18).
