---
id: ADR-0071
title: 로그인 전후 화면 시각 통일성
status: Accepted
date: 2026-10-21
related: [244, 243, 225, 238]
---

# ADR-0071: 로그인 전후 화면 시각 통일성

## 배경
- 비로그인 첫 화면(960·gap 8·h1→리드 20px)과 로그인 셸(≥1024 읽기 열 720·page gap 12·h1→다음 24px)이 다른 제품처럼 보였다(#244).
- 헤더 61px(#225)·헤더-본문 32px(#238)·제목-하단 24px(#243) 계약은 유지해야 한다.

## 결정
- 랜딩 컨테이너를 셸 읽기 열과 일치: `@media ≥1024 .moi-landing-head/.moi-landing{max-width:var(--moi-reading-max)}`. 전역 `.moi-container`(960) 변경 금지.
- 랜딩 히어로를 `.moi-page` 안에 넣어 셸과 같은 리듬 공유: h1→리드 24px·리드→CTA 36px·CTA `margin-top 24`.
- accent는 랜딩 브랜드 예외로 유지하되 `margin-bottom space-3`으로 조정해 accent→h1 24px 보존.

## 결과
- 긍정: 5폭·200%에서 컨테이너·헤더·제목·CTA 좌우 기준선 일치, h1→다음 24px 전후 동일, overflow 0.
- 부정/제약: accent(랜딩 전용)·nav/selector 유무·Kakao 46px/360px·리드/노트 타이포 차이는 기능·가이드 예외로 유지.

## 대안과 금지 사항
- 전역 `.moi-container` 720 변경·공유 gap 토큰 변경·새 로고/전역 폰트·인증/API/D1 변경 금지.
- 로그인 홈에 accent 추가·섹션/selector 재작성 금지(#239 무접촉).

## 참고
- 이슈 #244, DESIGN.md 5항, 실측 bbox·캡처는 PR 보고서.
