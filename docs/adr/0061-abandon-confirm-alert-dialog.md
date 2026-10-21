---
id: ADR-0061
title: 학습 포기 확인을 인라인 경고에서 AlertDialog 모달로 전환
status: Accepted
date: 2026-10-21
related: ["#223", "#148", "ADR-0012", "ADR-0035"]
---

# ADR-0061: 학습 포기 확인을 인라인 경고에서 AlertDialog 모달로 전환

## 배경
- #223: 인라인 확인 행이 320px에서 문구·버튼을 한 줄에挤혀 진행 표시와 여백이 없고, 포커스·Escape·복원 계약이 없었다.
- 공용 `ConfirmDialog`(Radix `AlertDialog` 기반)가 이미 존재·테스트됨. 단 그 확정 버튼(`AlertDialogAction`=`DialogPrimitive.Close`)은 클릭 시 무조건 닫혀 비동기 실패 처리에 부적합하다.

## 결정
- 포기 확인은 `src/ui/study/AbandonConfirmDialog.tsx`(Radix primitives 직접 구성, scoped)로 전환한다. 확정은 자동 닫힘 없는 일반 `Button`(destructive+pending)이며 성공 때만 닫는다. 공용 `ConfirmDialog` 파일은 무수정(기존 소비처·#224 영향 0).
- 문구는 `copy.study.abandonTitle/abandonDesc/abandonError`로 분리·중앙관리하고, 취소 기본 포커스·Escape·오버레이 비확정·트리거 포커스 복귀를 보장한다.
- `useAbandonFlow.ts`로 포기 흐름을 분리해 `useStudyFlow.ts` 상한(250줄)을 지킨다. 중복 방지는 `inFlightRef` 즉시 가드(`isPending`만으로 부족)이며 실패 시 해제한다.

## 결과
- 긍정: 모달 계약 충족, 본문 밀어냄 해소, 키보드·SR·5폭+200% 검증 가능.
- 부정/제약: pending 중 취소·닫힘을 잠그므로(일관된 settled 전이) 사용자가 대기 중 이탈할 수 없다. 성공 후 포커스는 시작 화면으로 자연 이동(트리거 소멸)한다.

## 대안과 금지 사항
- 인라인 CSS 패치만(반려): 접근성 계약 재발명·레이아웃 흔들림 잔존.
- `window.confirm`(금지): 스타일·포커스·문구 중앙관리 위반.
- 배경 클릭 확정(금지): 파괴적 오조작.
- 제출 확인 UX 확대(금지): 기존 인라인 제출 확인은 유지·구별한다.

## 참고
- #223, #148 / DESIGN.md 5·9절 / ADR-0012(문구·토큰 중앙관리) / ADR-0035(shadcn 전환).
