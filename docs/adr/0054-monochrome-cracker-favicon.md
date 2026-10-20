---
id: ADR-0054
title: 흰바탕 검정 크래커 파비콘
status: Accepted
date: 2026-10-20
related: [ADR-0031]
---

# ADR-0054: 흰바탕 검정 크래커 파비콘

## 배경
- #70 favicon 교체. 사용자 최종 지시(스피너 폐기): 새 모이를 크래커 형태로, 흰색·검정만, 실루엣이 잘 보이고 약간 기울어지게. 제품 UI 변경 없음. A/B 비교 후 사용자가 B안(2×2) 확정.

## 결정
- 마스터 `public/branding/moi-cracker.svg`(512 viewBox, 흰 라운드 `rx=116`+검정 `#0B0B0B` 1색).
- 크래커 기하: saltine형 사각+물결 가장자리(기본 92~420·파도 정점 6px→유효 340px), 전체 `rotate(-12 256 256)`.
- 구멍: B안 2×2 4개(`r=34`, 간격 100, 커밋·자산 기준). A안 3×3 9개는 비교 preview 옵션으로 스크립트에 유지.
- maskable 전용: 중심 기준 0.84 축소로 회전 후 네 모서리를 80% 안전원(반지름 205) 안에 유지. 일반 favicon 크기는 유지.
- 브라우저 크롬색은 기존 잉크(`#232F3E`) 유지: theme-color·manifest·TileColor 되돌림. 흰/검정은 아이콘 자산에만 적용.
- mask-icon은 배경·흰구멍 제거 후 `currentColor` 솔리드 실루엣(Safari 사각형 방지).
- 캐시: `index.html` 5링크+`webmanifest` icon src에 `?v=3`. PWA 재설치 전 구 아이콘 가능.

## 결과
- 긍정: 16px에서 사각 윤곽·구멍 식별, 단일 원본→파생 재생성·`--check` 결정성 유지.
- 부정/제약: 실기기(OS타일·iOS홈)·극구형 ICO 호환·PWA 재설치 후 표시는 미검증.

## 대안과 금지 사항
- 대안(기각): 스피너(사용자 폐기 지시), 새 실루엣(ADR-0031, Superseded), 다색·그라데이션, A안(비교 후 사용자 B 선택).
- 금지: AI 생성 주장·법률 보증 명문화, UI·인증·DB·Worker 변경, 외부 이미지·폰트·deps 추가.

## 참고
- 이슈 #70, `tests/unit/icons.test.ts`, `scripts/generate-icons.mjs`, ADR-0031(Superseded).
