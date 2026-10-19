---
id: ADR-0031
title: 새와 모이 SVG 마스터 기반 아이콘 자산
status: Proposed
date: 2026-10-19
related: []
---

# ADR-0031: 새와 모이 SVG 마스터 기반 아이콘 자산

## 배경
- #70(0.2 파비콘·OS 아이콘)에서 "귀여운 새가 모이를 찍어먹는 모습" 콘셉트를 16px에서도 식별되는 단순 아이콘으로 구현한다.
- 외부 이미지 파일·이미지 생성 서비스를 쓰지 않고, 코드로 직접 작성한 원본 벡터와 재현 가능한 파생 파이프라인이 필요하다. 팔레트는 ADR-0012(AWS Orange/잉크)를 따른다.

## 결정
- 마스터 `public/branding/moi-bird.svg`는 코드로 직접 작성한 원본 벡터다. 외부 이미지 파일·폰트·이미지 생성 서비스는 사용하지 않았다. 이는 원본의 작성 방식 기록이며 **최종 소유권·법률 보증을 주장하지 않는다.**
- 마스터(512 정사각 viewBox, 잉크 배경 + AWS Orange 실루엣, 작은 눈·모이 씨앗 2알)에서 `scripts/generate-icons.mjs`가 파생 자산을 재현 생성한다: favicon.svg, favicon.ico(16/32/48 PNG-in-ICO, Node Buffer 직접 패키징), icons PNG 16/32/48/180/192/512, maskable 192/512(안전영역 80% 원), 단색 mask-icon.svg, mstile-150, browserconfig.xml, site.webmanifest.
- PNG 렌더는 저장소에 이미 설치된 playwright Chromium을 사용하고 `--check`로 재생성 해시 일치(결정성)를 검증한다. 색상 규칙: 일반 아이콘은 라운드 배경, apple-touch·maskable·mstile은 불투명 풀블리드 정사각 배경.

## 결과
- 긍정: 단일 원본 → 모든 크기 파생, 외부 도구·네트워크 의존성 0, 스크립트로 자산 드리프트 검증 가능.
- 부정/제약: favicon.ico는 PNG-in-ICO 방식이라 극구형 환경(매우 오래된 Windows 크롬 등) 호환 여부는 미검증. 실제 OS별 표시(Windows 타일, iOS 홈 화면)는 실기기 검증 항목으로 남는다.

## 대안과 금지 사항
- 대안(기각): 이미지 생성 서비스 사용(벡터 작업에 부적합·금지), 외부 아이콘 라이브러리/폰트 기반 이모지(식별 낮음·의존성 추가), 15개 SVG 개별 수작업(드리프트 위험).
- 금지: 마스터를 AI 이미지 생성으로 만들었다고 주장하거나 소유권/법률 보증을 명문화하는 것, SEO 메타 전면 확장, 서비스워커/PWA 오프라인 도입(별도 범위).

## 참고
- 이슈 #70, tests/unit/icons.test.ts, scripts/generate-icons.mjs, ADR-0012(디자인 시스템).
