---
name: d1-drizzle-persistence
description: Cloudflare D1 + Drizzle ORM 스키마·마이그레이션·Repository 어댑터 작업 지침. users/external_identities/sessions 테이블, (provider, provider_subject) UNIQUE, 동시 최초 로그인 원자적 upsert, domain-Drizzle 분리 매퍼가 필요할 때 사용.
compatibility: wrangler 필요 (scripts/d1.sh).
---

# D1 + Drizzle 영속성 — 사용자 ID와 Kakao 계정 매핑

출처: 이슈 #3(선행 #2). PASETO `sub`에는 Kakao subject가 아니라 **앱 내부 user_id**를 담는다(#4).

## 스크립트 (우선 실행)
- `sh scripts/d1.sh status|apply|exec [local|remote] ["<SQL>"]` — wrangler D1 마이그레이션 상태/적용/조회 래퍼. DB 이름은 `DB_NAME` 환경변수(기본 moi-db, scaffold 확정 시 갱신).

## 스키마
- `users(id UUID PK, created_at, updated_at)`
- `external_identities(provider, provider_subject, user_id, created_at)` + `UNIQUE(provider, provider_subject)` + FK + 필수 인덱스
- `sessions`(#4 소관): `user_id` FK, `jti_hash`, `issued_at`, `expires_at`, `revoked_at` 등

## 구현 규칙
- D1 + Drizzle ORM. schema 및 마이그레이션 SQL을 커밋한다(순방향 migration).
- Drizzle은 app Repository Port 구현(`infra/persistence`)에만 노출. domain은 Drizzle 스키마 타입을 직접 참조하지 않는다 → mapper 사용.
- Zod는 HTTP/Kakao 외부 데이터 경계에서 검증하며, 도메인 값 객체의 불변식과 구분한다.
- 동시 최초 로그인 경합: UNIQUE 제약 기반 원자적 upsert/재조회로 처리. 중복 사용자-외부계정 매핑 생성 금지.
- 이메일/닉네임을 핵심키로 사용 금지. profile consent를 필수화하지 않는다.
- 후속 학습 데이터가 `user_id`로 격리될 수 있도록 app contract를 정의한다.

## 작업 절차
1. Drizzle schema + 마이그레이션 SQL 작성
2. 로컬 D1에 마이그레이션 적용(예: `wrangler d1 migrations apply`) 및 검증
3. Repository Port(interface)를 app에 정의 → D1 Adapter를 infra에 구현 → mapper 작성
4. 단위(fake port) + 통합(실제 Workers D1 migration) 테스트
5. PR에 마이그레이션 적용/롤백 정책과 재현 명령 문서화

## 테스트 (BDD 수용 조건)
- [ ] 최초 Kakao sub → 새 내부 user_id 생성
- [ ] 동일 sub 재로그인 → 기존 user_id 유지 (새 user_id 미생성)
- [ ] 서로 다른 두 sub → 각기 다른 user_id
- [ ] 동일 sub 동시 가입 요청 → 사용자-외부계정 매핑 1개만 잔존

## 로깅
- Pino 로그의 user_id는 필요한 최소 범위로 제한. Kakao sub·개인정보 불필요 출력 금지.

## 레퍼런스
- https://developers.cloudflare.com/d1/
- https://orm.drizzle.team/docs/overview
