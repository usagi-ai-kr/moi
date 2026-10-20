---
id: ADR-0055
title: 영역 ID canonical 정합과 원시 ID 차단
status: Accepted
date: 2026-10-20
related: ["#148", "#214", "#58", "ADR-0019"]
---

# ADR-0055: 영역 ID canonical 정합과 원시 ID 차단

## 배경
- 운영 D1 `exam_domains`의 실제 ID는 `dom-cost-optimization`(code `cost-optimization`, name `비용 최적화`)인데 UI `STUDY_DOMAINS`만 `dom-cost`를 쓰고 있었다. `domainLabel`이 미매칭 시 raw id를 반환해 학습 현황·이력 상세에 `dom-cost-optimization`이 노출되고, 학습 시작 영역 선택은 `dom-cost`를 전송해 실제 문항 필터와 불일치했다(#148, 사용자 목격).
- canonical id·legacy alias·unknown fallback은 영속 UI 정책인데 ADR이 없었다. 리뷰 비차단 #58 지적에 따라 PR #213 후속으로 보강한다.

## 결정
- canonical 영역 ID는 운영 D1 `exam_domains.id`(`dom-security`·`dom-resilience`·`dom-performance`·`dom-cost-optimization`)이며, UI `STUDY_DOMAINS`와 학습 시작 영역 필터(`onDomain`→세트 생성 `domainId`)는 canonical만 사용한다.
- legacy `dom-cost`는 표시 전용 alias로만 허용한다(`domainLabel` 매핑). 새 데이터·요청·픽스처에는 쓰지 않는다.
- 미지의 domain id는 raw를 반환하지 않고 `copy.stats.unknownDomain`(기타 영역)으로 표시해 `dom-` 원시값이 UI에 절대 나오지 않게 한다.
- 서버·D1·마이그레이션·Worker DTO 계약은 변경하지 않는다(UI 표시·전송 정합 버그픽스 범위).

## 결과
- 긍정: 영역별 현황·취약 추천·이력 상세가 한글 라벨만 보이고, 영역 선택이 실제 문항 필터와 일치한다.
- 부정/제약: unknown이 `기타 영역`으로 마스킹되어 데이터 불일치가 UI에서 직접 드러나지 않을 수 있다. `domainLabel` 단위 테스트(canonical·legacy·unknown)와 통계 패널 테스트로 보완하고, 불일치 의심 시 D1 `exam_domains`를 read-only로 대조한다.

## 대안과 금지 사항
- 미매칭 시 raw id 반환(기존 동작) — 내부 ID 노출이므로 금지한다.
- legacy `dom-cost`를 신규 저장·요청에 사용 — 필터 불일치를 만들 수 있어 금지한다(표시 매핑만 허용).
- 서버 D1 데이터 변경·마이그레이션·DTO 계약 변경으로 해결 — 범위 밖이므로 금지한다.

## 참고
- 이슈 #148, #214, 리뷰 비차단 #58, ADR-0019(문제은행·D1).
- `src/ui/stats/labels.ts`, `src/ui/study/types.ts`, `src/ui/copy.ts`, `tests/ui/study-raw-labels.test.tsx`.
