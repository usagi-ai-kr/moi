---
id: ADR-0091
title: 환영 삽화 외부 생성 API 사용
status: Accepted
date: 2026-10-22
related: ["#305", "#235", "ADR-0067"]
---

# ADR-0091: 환영 삽화 외부 생성 API 사용

## 배경
- 홈 히어로 인삿말 32종(#235)에 대응하는 삽화가 필요하다.
- 외부 이미지 생성 API(Gemini Nano Banana 2)를 사용해 32장을 생성하고 webp로 최적화한다.

## 결정
- 모델 ID: `gemini-nano-banana-2.1` (공식 문서 확인). API 키는 `.env`의 `GEMINI_API_KEY`만 사용하고 값은 출력·로그·커밋·리포트에 남기지 않는다.
- 생성 스크립트: `scripts/generate-welcome-illustrations.mjs` (키 없으면 exit 2).
- 결과: `public/welcome/{g01..g32}.webp`, 매핑 `src/ui/welcome-illustrations.ts`.
- 이미지 안에 문구를 넣지 않는다. alt는 카피 원문 기반.
- 라이선스/비용: 생성 이미지는 SynthID 워터마크 포함. 상업적 사용 가능 여부는 배포 전 확인한다.

## 결과
- 긍정: 32종 삽화를 단일 매핑으로 관리.
- 부정/제약: 외부 API 의존, 재생성 비용.

## 대안과 금지 사항
- API 키 노출 금지. 모델 ID 추측 금지(공식 문서 확인).

## 참고
- 이슈 #305, #235. 스크립트·매핑·테스트.