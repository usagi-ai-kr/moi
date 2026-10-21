---
id: ADR-0067
title: 학습 시작 환영 문구 32종·1시간 유지
status: Accepted
date: 2026-10-21
related: ["#235", "ADR-0012", "ADR-0018", "ADR-0064"]
---

# ADR-0067: 학습 시작 환영 문구 32종·1시간 유지

## 배경
- 홈 h1 "학습을 시작할 준비가 되었습니다"가 어색하다는 사용자 확정 (#235).
- 브랜드 moi 말장난 32종을 화면 진입마다 바꾸지 않고 1시간 유지·직전 제외.

## 결정
- 카피 단일 소스 `src/ui/greetings.ts`: 32종(g01~g32, #235 목록)·TTL 360만ms.
- 저장 `moi:hero-greeting:v1` 값 `{id, selectedAt}`만. 사용자·세션·학습 기록 금지.
- 첫 진입 균등 선택·60분 미만 동일·60분 후 다음 진입에 직전 제외 31택1.
- 타이머·폴링 교체 금지. storage event는 현재 만료 시에만 신선값 반영.
- 손상·미래·역행·차단은 첫 후보 fallback, UI·로그인 오류 아님.
- 홈 h1만 교체, `copy.session.welcome`은 widgets lead에 유지. h1 무aria-live.

## 결과
- 긍정: 깜빡임 없음(마운트 동기 확정)·탭 충돌 1시간 1회 이내·기존 e2e "moi" 포함 유지.
- 부정/제약: 차단 환경은 g01 고정(유지 불가). 키 변경 시 마이그레이션 별도.

## 대안과 금지 사항
- render 본문 랜덤·setInterval 교체·서버/D1·인증·학습 기록 변경 금지.
- 신규 의존성·lockfile 변경 금지. #224·#232 소유물 수정 금지.

## 참고
- #235 / DESIGN.md §카피 / `tests/ui/hero-greeting.test.tsx` 15건.
