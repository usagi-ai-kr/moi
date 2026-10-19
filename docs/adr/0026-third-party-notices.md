---
id: ADR-0026
title: lockfile 기반 제삼자 라이선스 고지 생성
status: Proposed
date: 2026-10-19
related: ["#121"]
---

# ADR-0026: lockfile 기반 제삼자 라이선스 고지 생성

## 배경
- #121 Phase 1의 OSS 기술 산출물로, 배포물에 포함된 production 의존성의 이름·버전·라이선스·저작권·출처를 재현 가능하게 고지해야 한다.
- 수작업 목록은 lockfile과 어긋나기 쉽고, 라이선스·저작권을 지어내면 안 된다.

## 결정
- `scripts/generate-third-party-notices.mjs`가 `pnpm licenses list --prod --json`(prod 직접·전이 94개)을 읽고 설치된 `package.json`/`LICENSE*`와 `pnpm-lock.yaml`을 교차 확인해 `THIRD_PARTY_NOTICES.md`를 생성한다.
- 저작권 확정은 설치된 `LICENSE*`의 Copyright 행에서만 한다. author만 있는 경우 저작권은 '확인 필요'로 표시한다(author와 저작권 혼동 금지). 정의문·예문·고지 의무 보일러플레이트(`shall mean`·`[yyyy]` 등)는 저작권이 아니며, `(c)`/`©`·연도가 없는 행은 인정하지 않는다. `LICENSE*`에 없으면 `NOTICE*`를 같은 기준으로 확인하고, 그래도 없으면 '확인 필요'로 둔다.
- 여러 버전이 공존하면(예: `@babel/runtime` 2종) 버전별 설치 경로의 LICENSE를 각각 읽어 행을 분리한다(동일 메타데이터 묶음 금지).
- `package.json` importers specifier와 lockfile 기록이 다르면 exit 1로 실패한다. 출력은 정렬 고정·타임스탬프 없음.
- devDependencies만인 패키지는 `--prod` 범위로 제외한다(양쪽 등록된 `@types/react`는 prod 경유이므로 포함).

## 결과
- 긍정: 동일 입력→동일 출력, `--check` 드리프트 검사, lockfile 불일치 즉시 진단.
- 부정/제약: 저작권 미확인 항목 존재(author만으로는 확정하지 않음). 완전 검증·최종 법률 승인을 주장하지 않는다.

## 대안과 금지 사항
- 수작업 표 관리 — 드리프트·지어내기 위험으로 기각. 전체 lockfile 복제 — 과도하므로 금지.
- 새 의존성 추가·UI 페이지·법률 문안 확정 금지(본 단위 범위 밖).

## 참고
- `tests/unit/licenses/third-party-notices.test.ts`, 실행: `node scripts/generate-third-party-notices.mjs [--check]`.
