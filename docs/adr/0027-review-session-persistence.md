---
id: ADR-0027
title: 복습 회차 D1 스냅샷 영속화
status: Proposed
date: 2026-10-19
related: ["#51", "ADR-0020", "ADR-0025", "ADR-0004"]
---

# ADR-0027: 복습 회차 D1 스냅샷 영속화

## 배경
- 복습 application Port `ReviewSessionRepository`(findActive·save)와 `ReviewSession` 도메인 타입은 존재하지만(#51), 영속 구현이 없어 이어풀기·스냅샷 고정(ADR-0020)이 동작하지 않는다.
- 회차 원본에는 대상·보기 순서·개정 버전·개별 채점 상태(pending/answered/pass·correct·gradedAt)·cursor까지 포함되며 roundtrip이 정확해야 한다.
- 계정·시험·모드당 활성 회차 1개 제약과 종료 후 재시작 규칙을 D1에서 검증 가능해야 한다.

## 결정
- **`review_sessions` 단일 테이블 + items JSON 스냅샷(1컬럼)**: 회차 원본 `items`(ReviewSessionItem[])를 JSON text로 원자적 저장한다. 읽기·쓰기 변환은 `review-session-mapper.ts`가 전담해 domain이 Drizzle 타입을 모르게 분리한다.
- **부분 UNIQUE `review_sessions_active_uq`**: `(user_id, exam_id, mode) WHERE status='active'`로 활성 회차 1개를 D1이 강제한다. ended 행은 대상에서 제외되어 종료 후 같은 축의 새 회차 시작을 막지 않는다.
- **save 허용 범위**: ① 신규 활성 회차 INSERT(중복 활성 있으면 부분 UNIQUE 위반으로 실패) ② 같은 id·소유자(userId/examId/mode) 활성 회차의 진행·종료 갱신 ③ 종료 회차의 **동일 스냅샷 재저장(멱등, 쓰기 생략)** 만.
- **금지 전이를 거부**: 소유자·시험·모드 변경, 다른 회차 덮어쓰기, 종료 회차의 이력 수정(다른 스냅샷), 종료 회차의 활성 복원.
- **종료 경합 방지**: 갱신 UPDATE의 WHERE에 `status='active'`+소유축을 넣는다. SELECT~UPDATE 사이 다른 요청이 종료하면 0행 변경 → 충돌거부로 부활을 막는다.
- `userId` FK(users), examId/mode/status는 text, 시각은 epoch 초 integer. 복습 시도 이력(study_attempts)과의 원자화는 ADR-0025 후속 단위다.

## 결과
- 긍정: 이어풀기·스냅샷 고정이 D1에 영속화되고, 활성 1개·종료 후 재시작·금지 전이가 실 D1 테스트로 증명된다. JSON 스냅샷으로 roundtrip 정확성과 원자성을 얻고 스키마가 작게 유지된다.
- 부정/제약: items 전체를 읽고 교체하므로 항목별 조회·갱신에는 별도 설계가 필요하다. mapper는 JSON 파싱 오류와 일부 형태 오류를 감지하며 전체 도메인 불변식 검증은 보장하지 않는다. 복습 정정 반영 방식은 이 단위에서 결정하지 않는다.

## 대안과 금지 사항
- **정규화 테이블(review_session_items 별도 행)**: 행 단위 조작·스키마 복잡도 부담 대비 이점이 적어 기각 — 필요 시 후속 ADR.
- 종료 회차 이력 수정·채점 결과 덮어쓰기·미채점 문제 종료 시 오답 자동 처리 — ADR-0020 금지 유지.
- 회차 소유자(내부 user_id) 변경·다른 사용자 회차 재사용 — 금지(ADR-0004 소유권 기준).
- 동시 답안 CAS·attempt 저장 원자화·bootstrap runtime 연결 — 이 단위 범위 아님으로 후속 명시.

## 참고
- 이슈 #51(복습 application Port), ADR-0020(학습·복습), ADR-0025(study_attempts D1 저장 계약 — attempt 원자화는 후속), ADR-0004(사용자 소유권)
- 검증: `pnpm exec vitest run --project worker tests/worker/review-session-schema.test.ts tests/worker/review-session-repository.test.ts`
