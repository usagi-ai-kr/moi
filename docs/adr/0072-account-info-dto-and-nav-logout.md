---
id: ADR-0072
title: 계정 정보 DTO·파생 최근 로그인·내비게이션 로그아웃 배치
status: Accepted
date: 2026-10-21
related: [ADR-0004, ADR-0005, ADR-0012, ADR-0018, ADR-0056, ADR-0057]
---

# ADR-0072: 계정 정보 DTO·파생 최근 로그인·내비게이션 로그아웃 배치

## 배경
- 이슈 #234: 계정 화면에 가입일·최근 로그인·로그인 방식이 필요하고, 로그아웃은 계정 본문에서 내비게이션으로 옮겨야 한다.
- 스키마: `users.created_at`(가입일)·`sessions.issued_at`(세션 발급=로그인 시각)만 있고 `last_login` 컬럼은 없다. `users.updated_at`는 insert 때만 채워지고 갱신되지 않아 최근 로그인 대용이 안 된다.

## 결정
1. **`/api/me` DTO 확장(신규 엔드포인트 없음)** — `{ user: { id, createdAt, lastLoginAt } }`. 둘 다 epoch seconds, `lastLoginAt`은 nullable. 401·`Cache-Control: no-store` 유지(ADR-0018 단일 진실 원천).
2. **최근 로그인은 파생 조회** — `MAX(sessions.issued_at) WHERE user_id = ?`. 세션 행은 물리 삭제 없이 `revoked_at`로만 폐기되므로 최대값이 마지막 로그인이다. **마이그레이션·write 0건**.
3. **표시 규약** — 내부 UUID·sub·jti는 화면에 내보내지 않는다(API id 계약은 유지). 초/ms·0/null·손상은 `formatDateTime`이 '정보 없음'으로 되돌린다(1970 금지, ADR-0056).
4. **로그아웃 위치** — AppShell 데스크톱 nav·모바일 Drawer의 `<button type="button">` 액션. 계정 본문에서는 제거. 기존 `useLogout` 계약(세션 폐기·계정별 초안/탭 정리·`['me']` reset) 재사용, 새 계약 없음. pending=disabled+aria-busy, 실패=role=alert+재시도, 성공 시 Drawer 닫기. 비로그인 미노출은 로그인 셸 미렌더로 구조적으로 보장.
5. **위험 강조 위계** — 로그아웃은 파괴 행위가 아니므로 중립 강조로 두고 danger 강조는 회원 탈퇴 위험 영역에 남긴다.
6. **탈퇴·회원 코드는 범위 밖** — 0.2.4는 위험 영역 안내 + 비활성 버튼까지만(삭제·완료 표시 없음). 회원 코드·등급은 정책 확정 후 0.3 후속 ADR.

## 결과
- 긍정: 마이그레이션·원격 D1 쓰기 없이 가입일·최근 로그인을 즉시 표시. 계정 화면 빈 공간 해소, 로그아웃 접근성 향상.
- 부정/제약: `sessions`에 `(user_id, issued_at)` 집계 인덱스가 없다(현재 규모 무해). 영속 `last_login_at`이 필요해지면 별도 마이그레이션 + 원격 승인(#127).

## 대안과 금지 사항
- 신규 `GET /api/account`: 이중 계약·별도 로딩 상태 → 기각(단일 진실 원천 유지).
- `users.updated_at` 재사용: 갱신되지 않아 의미 없음 → 기각.
- `users.last_login_at` 영속 컬럼: 백필·정밀 기록 요구 시에만(Phase B) → 보류.
- 계정 본문 로그아웃 중복 노출, 계정 화면·Drawer 동시 버튼 → 금지(위계 혼란).

## 참고
- 이슈 #234(o 결정 2026-10-21), 준비 보고서 `tmp/report-234-account-prep.md`.
- ADR-0004(내부 사용자 식별)·ADR-0005(세션)·ADR-0012(토큰·문구 단일 소스)·ADR-0018(세션 UI 계약)·ADR-0056(타임스탬프 표기)·ADR-0057(모바일 Drawer).
