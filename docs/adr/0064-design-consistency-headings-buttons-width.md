---
id: ADR-0064
title: 화면 간 디자인 계약: 헤딩·버튼·폭·상태/아이콘
status: Accepted
date: 2026-10-21
related: ["#225", "ADR-0012", "ADR-0014", "ADR-0035", "ADR-0050", "ADR-0060", "ADR-0062"]
---

# ADR-0064: 화면 간 디자인 계약: 헤딩·버튼·폭·상태/아이콘

## 배경
- Start/Question/Result/History는 h2만, Review는 Tailwind 덮어씀, Account h1 26px, 홈 h1 없음.
- 버튼 높이/반경 6/8/12 혼재, alert 360px 협소, 아이콘 16/20/24 선언만 있고 역할표 없음.

## 결정
- 헤딩: 경로별 h1 1개(홈·시작·문항·결과·이력·복습·계정·로그아웃), 섹션 h2, 하위 h3.
- 학습 흐름 h1은 `moi-study-title`(26px) 의미 고정·시각 유지, 진입 h1은 `moi-title`(h1 토큰).
- 버튼: primary 8px/secondary 6px/kakao 12px(공식 예외), shadcn sm/md 8px·lg 12px·높이 44px.
- 네이티브 40px+coarse 44px, disabled 0.5·hover 0.92·active 0.88·focus-visible·pending 통일.
- 폭: container 960·reading 720 단일, study는 셸 720열 충전(760–900 별도 토큰 없음).
- 상태: 기존 copy·Skeleton 재사용, 신규 문구·아이콘·의존성 금지, alert 최대폭 100%.
- 아이콘: sm 16(인라인·알림·스피너)·md 20(배지·체크)·lg 24(내비) 토큰 단일 소스.

## 결과
- 긍정: h1 1개·역할 매트릭스·토큰 단일 소스, 5폭 overflow 0.
- 부정/제약: 학습 h1 시각 26px(h1 토큰과 상이, 예외 문서화), CardTitle h3·미사용 카드 잔류.

## 대안과 금지 사항
- 값 일괄 통일 리디자인·신규 로고·문구 추가 금지. #224·서버·D1·인증 변경 금지.
- Kakao 46px/12px 공식값 변경 금지. stats/history 블록·tabs 소유물 수정 금지.

## 참고
- #225 / DESIGN.md §2·5·9 / tokens.ts / audit·overflow·RTL 증거.
