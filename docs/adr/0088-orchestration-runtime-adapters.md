---
id: ADR-0088
title: 런타임 비종속 오케스트레이션 코어와 내구 인박스
status: Accepted
date: 2026-10-22
related: ["ADR-0023", "ADR-0042"]
---

# ADR-0088: 런타임 비종속 오케스트레이션 코어와 내구 인박스

## 배경
- ADR-0042는 o/r/w 역할과 교차 리뷰 원칙을 정했지만, 콜백 전달이 `herdr agent prompt`와 특정 패널 타깃에 직접 연결되어 있다.
- 런타임을 바꾸거나 여러 런타임이 공존할 때 역할·콜백 처리 코드를 수정하지 않도록 전달 경계를 분리하고, 전달 실패 뒤에도 콜백이 남는 내구 큐가 필요하다.

## 결정
- 오케스트레이션 코어는 역할 `o`(디스패치·수락), `w`(구현), `r`(리뷰)만 인식한다. adapter 및 target 설정은 `.agents/orchestration/roles.json`에 둔다. 런타임/패널 이름은 이 설정 밖에 고정하지 않는다.
- 메시지는 `tmp/inbox/*.jsonl`에 `{id,ts,to,kind,unit,status,report,delivered}` 형태로 append-only 기록한다. 동일 id의 최신 레코드가 전달 상태를 나타내며, 전달 실패나 busy 상태는 pending으로 남긴다.
- adapter 계약은 `isIdle(role)`, `send(role, text)`다. 현재 Herdr adapter와 파일 인박스를 읽는 `file` adapter를 제공하며, 새 런타임은 adapter 파일 하나로 확장한다.
- daemon은 o행 pending을 interval마다 묶어 확인하고, o adapter가 idle인 경우에만 전달한다. 성공 뒤 delivered를 기록한다. `--once`, `--interval`, `--roles`, `--inbox`를 지원한다.
- `notify.sh`는 기존 인자 형식과 종료 코드를 유지하고, 콜백 인박스 기록과 `callbacks.log` 호환 기록을 함께 남긴다. 런타임으로 직접 보내는 경로는 adapter에만 둔다.
- ADR-0042를 이 ADR로 대체한다. 역할 분리, 교차 모델 리뷰, 완료 콜백 의무, 사용자 승인 경계와 수정 라운드 규칙은 유지하며, 특정 Herdr target/직접 전송만 역할 설정과 adapter로 이동한다.

## 결과
- 긍정: 콜백이 전달보다 먼저 내구 기록되어 재시도할 수 있고, 역할·업무 코드는 런타임에 종속되지 않는다. 새 런타임 추가 시 daemon 변경을 피한다.
- 부정/제약: inbox 보관·중복 id 처리·전달 ack를 관리해야 한다. 역할 설정 오류와 daemon 중단은 전달 지연을 만들 수 있다.

## 대안과 금지 사항
- `notify.sh`에서 Herdr 등 특정 런타임을 직접 호출하는 방식은 금지한다.
- 메시지 파일을 덮어쓰거나 전달 전에 delivered로 바꾸지 않는다.
- `--wait` 종료를 워커 완료로 해석하지 않는다. daemon의 inbox 재시도와 작업자 완료 판정은 분리한다.

## 참고
- ADR-0023, ADR-0042, `agent-orchestration` 스킬, `docs/harness/orchestration.md`
