---
id: ADR-0004
title: 내부 사용자 ID와 외부 계정 매핑
status: Accepted
date: 2026-10-18
related: ["#3", "#11"]
---

# ADR-0004: 내부 사용자 ID와 외부 계정 매핑

## 배경
- 데이터 소유권(학습 데이터 격리)의 기준이 되는 내부 식별자가 필요하다. 외부 공급자 `sub`을 그대로 키로 쓰면 공급자 교체·추가가 불가능해진다.

## 결정
- 내부 ID는 앱이 발급하는 UUID(`crypto.randomUUID()`)다. Kakao `sub`은 내부 ID로 사용하지 않는다.
- 스키마:
  - `users(id TEXT PRIMARY KEY, created_at, updated_at)`
  - `external_identities(id, provider, provider_subject, user_id FK → users.id, created_at)` + `UNIQUE(provider, provider_subject)` + `INDEX(user_id)`
- app Port: `resolveOrCreate(provider, subject): Promise<{ userId }>`. 중복 방지는 D1의 단일 문장/트랜잭션 배치 특성을 이용한 원자적 처리 + 재조회로 구현하고, 경합에서 탈락한 요청이 만든 미연결 user 행은 같은 처리/보상으로 제거한다(고아 신규 user 0건). 최종 알고리즘은 SQL/Drizzle 테스트를 거쳐 확정한다.
- 이메일/닉네임은 핵심키가 아니며 동의를 필수화하지 않는다(컬럼은 두지 않거나 nullable).
- domain은 Drizzle 스키마 타입을 직접 참조하지 않고 mapper를 통해 도메인 객체로 변환한다.
- migration은 forward-only. 배포 전 원격 백업/내보내기와 복구 경로를 release runbook에 기록한다.

## 결과
- 긍정: 다수 공급자 확장 가능, 동시 최초 로그인에도 1:1 매핑 보증.
- 부정/제약: 보상 정리·매퍼 등 추가 코드. D1 트랜잭션 한계에 맞춘 테스트 필요.

## 대안과 금지 사항
- Kakao `sub`/PII(이메일)를 내부 키로 사용 — 금지.
- 자동 down migration 가정 — 금지(D1 미지원). 기존 사용자 row 삭제 — 금지.

## 참고
- 이슈 #3, #11 / `d1-drizzle-persistence` 스킬 / Drizzle 문서.
