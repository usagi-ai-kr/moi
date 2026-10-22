# Architecture Decision Records (ADR)

moi의 **모든 기술적 추가 판단·변경**은 이 디렉터리에 ADR로 기록한다. (규칙: `AGENTS.md` 하네스·문서 관리, ADR-0010)

## 규칙
- 파일명: `NNNN-kebab-slug.md` (4자리 순차 번호). 제목은 한국어.
- 생성: `sh .agents/skills/adr-management/scripts/new-adr.sh <slug> "<제목>"` — `template.md` 기반으로 다음 번호가 자동 부여된다.
- 인덱스 갱신: `python3 .agents/skills/adr-management/scripts/adr-index.py` — 아래 표를 프런트매터에서 자동 재생성한다.
- 상태값: `Proposed`(제안) → `Accepted`(합의·적용) → `Deprecated`(폐기) 또는 `Superseded by ADR-NNNN`(대체됨).
- 기존 결정을 변경할 때: 기존 ADR 상태를 `Superseded by ADR-NNNN`으로 바꾸고 새 ADR을 추가한다. 기존 본문은 수정하지 않는다(오탈자 등 비의미 변경만 허용).
- 기능 구현 이슈에서 내린 기술 판단도 PR에서 ADR 추가/갱신 여부를 확인한다. ADR 없는 기술 변경은 완료로 보지 않는다.
- 우선순위: 최신 ADR > `AGENTS.md` > 스킬 세부 절차.

## 인덱스

<!-- ADR_INDEX:START -->
| ADR | 제목 | 상태 | 날짜 | 파일 |
| --- | --- | --- | --- | --- |
| ADR-0001 | Clean Architecture 계층 경계와 책임 | Accepted | 2026-10-18 | [0001-clean-architecture-boundaries.md](./0001-clean-architecture-boundaries.md) |
| ADR-0002 | 확정 기술 스택 | Accepted | 2026-10-18 | [0002-confirmed-tech-stack.md](./0002-confirmed-tech-stack.md) |
| ADR-0003 | Kakao OAuth2 Authorization Code + OIDC 인증 | Accepted | 2026-10-18 | [0003-kakao-oidc-auth-flow.md](./0003-kakao-oidc-auth-flow.md) |
| ADR-0004 | 내부 사용자 ID와 외부 계정 매핑 | Accepted | 2026-10-18 | [0004-internal-user-identity-mapping.md](./0004-internal-user-identity-mapping.md) |
| ADR-0005 | 앱 세션 PASETO v4.local | Accepted | 2026-10-18 | [0005-paseto-v4-local-session.md](./0005-paseto-v4-local-session.md) |
| ADR-0006 | 비밀값·로그·개인정보 정책 | Accepted | 2026-10-18 | [0006-secrets-logging-policy.md](./0006-secrets-logging-policy.md) |
| ADR-0007 | TDD/BDD와 CI 게이트 | Superseded by ADR-0043 | 2026-10-18 | [0007-tdd-bdd-ci-gates.md](./0007-tdd-bdd-ci-gates.md) |
| ADR-0008 | 버전 규칙과 Milestone 체계 | Superseded by ADR-0017 | 2026-10-18 | [0008-version-and-milestones.md](./0008-version-and-milestones.md) |
| ADR-0009 | 브랜치·PR 플로우 | Accepted | 2026-10-18 | [0009-branch-pr-flow.md](./0009-branch-pr-flow.md) |
| ADR-0010 | 하네스·문서 관리 체계 | Accepted | 2026-10-18 | [0010-harness-doc-management.md](./0010-harness-doc-management.md) |
| ADR-0011 | UI/Worker 실행 환경 경계와 배포 검증 계약 | Accepted | 2026-10-18 | [0011-runtime-boundary-release-contract.md](./0011-runtime-boundary-release-contract.md) |
| ADR-0012 | 디자인 시스템 — AWS 팔레트·KoddiUD 온고딕/Inter·레이아웃·모션 | Accepted | 2026-10-18 | [0012-design-system-aws-koddiud-inter.md](./0012-design-system-aws-koddiud-inter.md) |
| ADR-0013 | 하네스 모듈 길이 예산 — 검사·관리 자동화 | Superseded by ADR-0015 | 2026-10-18 | [0013-harness-module-length-budget.md](./0013-harness-module-length-budget.md) |
| ADR-0014 | 디자인 시스템 보강 — 폰트 제공·UI 제약 예외·여백·Lighthouse·카카오 버튼 | Accepted | 2026-10-18 | [0014-design-system-supplement-font-ui-kakao.md](./0014-design-system-supplement-font-ui-kakao.md) |
| ADR-0015 | src 모듈 길이 예산 — 하네스·src 통합 | Accepted | 2026-10-18 | [0015-src-module-length-budget.md](./0015-src-module-length-budget.md) |
| ADR-0016 | Kakao OIDC 구현 — 상태 소비·JWKS 검증·응답/로그 계약 | Accepted | 2026-10-18 | [0016-kakao-oidc-implementation.md](./0016-kakao-oidc-implementation.md) |
| ADR-0017 | 0.2.x 버전·거버넌스·출시 게이트 | Superseded by ADR-0030 | 2026-10-18 | [0017-version-governance-0.2.x.md](./0017-version-governance-0.2.x.md) |
| ADR-0018 | 세션·UI 상태 계약 — 서버 진실 원천과 캐시 규칙 | Accepted | 2026-10-18 | [0018-session-ui-state-contract.md](./0018-session-ui-state-contract.md) |
| ADR-0019 | 0.2.0 문제은행·품질·관리 API | Superseded by ADR-0030 | 2026-10-18 | [0019-question-bank-quality.md](./0019-question-bank-quality.md) |
| ADR-0020 | 0.2.0 20문제 풀이·오답/북마크 복습 | Superseded by ADR-0059 | 2026-10-18 | [0020-study-and-review.md](./0020-study-and-review.md) |
| ADR-0021 | 0.2.0 저장·복구·단일 세션·신고·정정·통계 | Superseded by ADR-0030 | 2026-10-18 | [0021-storage-reports-stats.md](./0021-storage-reports-stats.md) |
| ADR-0022 | 디스플레이 폰트 LCP 안정화 — optional·지연 주입 | Accepted | 2026-10-18 | [0022-display-font-lcp-stability.md](./0022-display-font-lcp-stability.md) |
| ADR-0023 | 에이전트 컨텍스트 리셋·워커 산출물 검증 | Accepted | 2026-10-18 | [0023-agent-context-and-output-verification.md](./0023-agent-context-and-output-verification.md) |
| ADR-0024 | 학습 통계·취약 영역 파라미터 | Accepted | 2026-10-18 | [0024-study-stats-parameters.md](./0024-study-stats-parameters.md) |
| ADR-0025 | study_attempts attempt/firstAttempt D1 집계 저장 계약 | Proposed | 2026-10-18 | [0025-study-attempt-aggregation.md](./0025-study-attempt-aggregation.md) |
| ADR-0026 | lockfile 기반 제삼자 라이선스 고지 생성 | Proposed | 2026-10-19 | [0026-third-party-notices.md](./0026-third-party-notices.md) |
| ADR-0027 | 복습 회차 D1 스냅샷 영속화 | Proposed | 2026-10-19 | [0027-review-session-persistence.md](./0027-review-session-persistence.md) |
| ADR-0028 | 복습 회차 진행과 시도 기록 원자 저장 | Superseded by ADR-0038 | 2026-10-19 | [0028-review-grade-atomic.md](./0028-review-grade-atomic.md) |
| ADR-0030 | 0.2 학습 실사용·디자인과 0.3 이관 | Superseded by ADR-0033 | 2026-10-19 | [0030-learning-scope-and-design.md](./0030-learning-scope-and-design.md) |
| ADR-0031 | 새와 모이 SVG 마스터 기반 아이콘 자산 | Superseded by ADR-0054 | 2026-10-19 | [0031-bird-brand-icons.md](./0031-bird-brand-icons.md) |
| ADR-0032 | 첫 화면 사실 문구·초기 렌더 | Superseded by ADR-0060 | 2026-10-19 | [0032-learning-home-first-screen.md](./0032-learning-home-first-screen.md) |
| ADR-0033 | 0.2 학습용 500문제 원복과 생성·검증 | Accepted | 2026-10-19 | [0033-500-question-learning-scope.md](./0033-500-question-learning-scope.md) |
| ADR-0034 | 해설 마크다운·Mermaid 렌더링 | Superseded by ADR-0045 | 2026-10-19 | [0034-explanation-markdown-mermaid.md](./0034-explanation-markdown-mermaid.md) |
| ADR-0035 | 학습 UI shadcn/ui·Tailwind 전환과 디자인 계약 | Accepted | 2026-10-19 | [0035-design-shadcn-tailwind.md](./0035-design-shadcn-tailwind.md) |
| ADR-0036 | 이력 페이지 URL 상태와 비동기 조회 UX | Accepted | 2026-10-19 | [0036-history-pagination-url-state.md](./0036-history-pagination-url-state.md) |
| ADR-0037 | 0.2.4 복습 소스·북마크 영속 및 원자 채점 필수 연결 | Accepted | 2026-10-19 | [0037-review-source-bookmark-persist.md](./0037-review-source-bookmark-persist.md) |
| ADR-0038 | 복습 원자 채점 0행 보상과 세트·복습 firstAttempt 경합 | Accepted | 2026-10-19 | [0038-review-grade-first-attempt-zero-row.md](./0038-review-grade-first-attempt-zero-row.md) |
| ADR-0039 | 복습 HTTP API와 Worker·D1 통합 계약 | Accepted | 2026-10-19 | [0039-review-http-api-worker.md](./0039-review-http-api-worker.md) |
| ADR-0040 | 복습 API 시험 식별자 내부 ID 정규화 | Superseded by ADR-0058 | 2026-10-19 | [0040-exam-identifier-canonicalization.md](./0040-exam-identifier-canonicalization.md) |
| ADR-0041 | 복습 회차 종료 cursor CAS와 stale 답안 경합 | Accepted | 2026-10-19 | [0041-review-session-end-cursor-cas.md](./0041-review-session-end-cursor-cas.md) |
| ADR-0042 | 리뷰 전담 r 역할과 워커 콜백 기반 오케스트레이션 | Superseded by ADR-0090 | 2026-10-20 | [0042-reviewer-callback-orchestration.md](./0042-reviewer-callback-orchestration.md) |
| ADR-0043 | CI에 THIRD_PARTY_NOTICES --check 게이트 추가 | Accepted | 2026-10-20 | [0043-ci-notices-check-gate.md](./0043-ci-notices-check-gate.md) |
| ADR-0044 | 해설 Mermaid 노드 라벨 인용 규칙 | Accepted | 2026-10-20 | [0044-mermaid-label-quote.md](./0044-mermaid-label-quote.md) |
| ADR-0045 | 해설 Mermaid 렌더러 Pele 전환 | Superseded by ADR-0047 | 2026-10-20 | [0045-pele-mermaid-renderer.md](./0045-pele-mermaid-renderer.md) |
| ADR-0046 | 학습 세트 10문제 조정 | Superseded by ADR-0081 | 2026-10-20 | [0046-ten-question-study-set.md](./0046-ten-question-study-set.md) |
| ADR-0047 | Pele 전환 0.2.4 구현 시점과 전환·복구 계약 | Accepted | 2026-10-20 | [0047-pele-0.2.4-implementation-timing.md](./0047-pele-0.2.4-implementation-timing.md) |
| ADR-0048 | 작업 정지 절차와 브리프·보고서 절대 경로 | Superseded by ADR-0051 | 2026-10-20 | [0048-orchestration-stop-protocol.md](./0048-orchestration-stop-protocol.md) |
| ADR-0049 | 제출 전 정답 개수 안내 | Accepted | 2026-10-20 | [0049-answer-count-disclosure.md](./0049-answer-count-disclosure.md) |
| ADR-0050 | 하이브리드 기기 터치 타깃 44px | Accepted | 2026-10-20 | [0050-any-pointer-touch-target.md](./0050-any-pointer-touch-target.md) |
| ADR-0051 | 저장소 tmp/ 작업 디렉터리와 이슈 기반 인수인계 | Accepted | 2026-10-20 | [0051-tmp-workdir-handover.md](./0051-tmp-workdir-handover.md) |
| ADR-0052 | 학습 결과 제출 계약 정합 | Accepted | 2026-10-20 | [0052-study-result-contract.md](./0052-study-result-contract.md) |
| ADR-0053 | 도식 로딩·오류 안내 AT 노출 | Accepted | 2026-10-20 | [0053-diagram-announcement.md](./0053-diagram-announcement.md) |
| ADR-0054 | 흰바탕 검정 크래커 파비콘 | Accepted | 2026-10-20 | [0054-monochrome-cracker-favicon.md](./0054-monochrome-cracker-favicon.md) |
| ADR-0055 | 영역 ID canonical 정합과 원시 ID 차단 | Accepted | 2026-10-20 | [0055-domain-id-canonicalization.md](./0055-domain-id-canonicalization.md) |
| ADR-0056 | 학습 타임스탬프 표시 규약과 단일 시험 상수 | Accepted | 2026-10-20 | [0056-study-timestamp-and-single-exam.md](./0056-study-timestamp-and-single-exam.md) |
| ADR-0057 | 모바일 햄버거·우측 Drawer 구현과 반응형 breakpoint 정책 | Accepted | 2026-10-20 | [0057-mobile-drawer-native-dialog.md](./0057-mobile-drawer-native-dialog.md) |
| ADR-0058 | 복습 시험 식별자 공개 코드 정규화와 내부 ID 읽기 호환 | Accepted | 2026-10-21 | [0058-review-exam-id-code.md](./0058-review-exam-id-code.md) |
| ADR-0059 | 복습 10문항 회차와 remaining/cycle 큐 | Accepted | 2026-10-21 | [0059-review-round-10-queue.md](./0059-review-round-10-queue.md) |
| ADR-0060 | 홈 안내 문구 삭제 | Accepted | 2026-10-21 | [0060-home-note-removal.md](./0060-home-note-removal.md) |
| ADR-0061 | 학습 포기 확인을 인라인 경고에서 AlertDialog 모달로 전환 | Accepted | 2026-10-21 | [0061-abandon-confirm-alert-dialog.md](./0061-abandon-confirm-alert-dialog.md) |
| ADR-0062 | 공통 브랜드·헤더 토큰 계약 | Accepted | 2026-10-21 | [0062-brand-header-tokens.md](./0062-brand-header-tokens.md) |
| ADR-0063 | 학습 현황 하위 탭의 URL 상태·패널 분할·Tabs 구현 결정 | Accepted | 2026-10-21 | [0063-history-sub-tabs-url-state.md](./0063-history-sub-tabs-url-state.md) |
| ADR-0064 | 화면 간 디자인 계약: 헤딩·버튼·폭·상태/아이콘 | Accepted | 2026-10-21 | [0064-design-consistency-headings-buttons-width.md](./0064-design-consistency-headings-buttons-width.md) |
| ADR-0065 | 결과 CTA 밑줄·마지막 문항 제출 위치·결과 종료 동선 | Accepted | 2026-10-21 | [0065-result-cta-last-question-submit.md](./0065-result-cta-last-question-submit.md) |
| ADR-0066 | 완료한 학습 목록의 컬럼 표·숫자 서체와 모바일 라벨-값 카드 | Accepted | 2026-10-21 | [0066-completed-history-columns.md](./0066-completed-history-columns.md) |
| ADR-0067 | 학습 시작 환영 문구 32종·1시간 유지 | Accepted | 2026-10-21 | [0067-hero-greeting.md](./0067-hero-greeting.md) |
| ADR-0068 | 시험 연결 context·selector·URL 계약과 Phase 1/2 경계 | Superseded by ADR-0077 | 2026-10-21 | [0068-exam-context-selector.md](./0068-exam-context-selector.md) |
| ADR-0069 | nav 워드마크 Bricolage Grotesque 적용 | Accepted | 2026-10-21 | [0069-brand-wordmark-bricolage.md](./0069-brand-wordmark-bricolage.md) |
| ADR-0070 | 정적 OG/X 메타와 1200×630 공유 이미지 계약 | Accepted | 2026-10-21 | [0070-og-static-meta-image.md](./0070-og-static-meta-image.md) |
| ADR-0071 | 로그인 전후 화면 시각 통일성 | Accepted | 2026-10-21 | [0071-login-consistency.md](./0071-login-consistency.md) |
| ADR-0072 | 계정 정보 DTO·파생 최근 로그인·내비게이션 로그아웃 배치 | Accepted | 2026-10-21 | [0072-account-info-dto-and-nav-logout.md](./0072-account-info-dto-and-nav-logout.md) |
| ADR-0073 | 아이콘 체계 — Lucide 단일 계열·액션 매핑·접근성 계약 | Accepted | 2026-10-21 | [0073-icon-system-lucide-mapping-accessibility.md](./0073-icon-system-lucide-mapping-accessibility.md) |
| ADR-0074 | 북마크 상태 모양 구분·정답 표시 중복 제거·날짜 하한·페이저 간격 | Accepted | 2026-10-21 | [0074-ux-polish-bookmark-date-lower-bound.md](./0074-ux-polish-bookmark-date-lower-bound.md) |
| ADR-0075 | 단위 묶음 완성 알림 — 공통 스크립트·스킬 기반 Discord webhook 1회 통지 | Accepted | 2026-10-21 | [0075-orchestrator-completion-notify.md](./0075-orchestrator-completion-notify.md) |
| ADR-0076 | 학습 범위 안내 정리·fieldset 위계와 문제 수 분리 | Accepted | 2026-10-21 | [0076-study-scope-guidance-hierarchy.md](./0076-study-scope-guidance-hierarchy.md) |
| ADR-0077 | 시험 선택을 콘텐츠 최상단으로 이동 | Accepted | 2026-10-21 | [0077-exam-content-top.md](./0077-exam-content-top.md) |
| ADR-0078 | 문제 신고 액션 버튼 표면/상태/44px 계약 | Accepted | 2026-10-21 | [0078-report-button-action-surface.md](./0078-report-button-action-surface.md) |
| ADR-0079 | 근거 링크 칩 padding·wrap·상태·외부링크 semantics | Accepted | 2026-10-21 | [0079-source-link-chip-padding-wrap-state-semantics.md](./0079-source-link-chip-padding-wrap-state-semantics.md) |
| ADR-0080 | 중복 인터랙션 잠금 — 시작·제출 동기 가드와 충돌 CTA 차단 | Accepted | 2026-10-21 | [0080-interaction-lock.md](./0080-interaction-lock.md) |
| ADR-0081 | 학습·복습 회차 문제 수 4/8 선택 | Accepted | 2026-10-21 | [0081-set-size-4-8.md](./0081-set-size-4-8.md) |
| ADR-0082 | 학습·복습 문제 풀이 카드 UI 공통화 | Accepted | 2026-10-21 | [0082-question-card-ui-unification.md](./0082-question-card-ui-unification.md) |
| ADR-0083 | 시험 Select chevron 여백 — 네이티브 select 유지와 아이콘 배치 | Accepted | 2026-10-21 | [0083-exam-select-chevron.md](./0083-exam-select-chevron.md) |
| ADR-0084 | 에이전트 코멘트와 사용자 승인 구분 — 우선순위·범위 변경 규칙 | Accepted | 2026-10-21 | [0084-agent-comment-approval.md](./0084-agent-comment-approval.md) |
| ADR-0085 | 오케스트레이터 Discord 알림 이벤트 확장 — intervention·confirmation·deliverable | Accepted | 2026-10-21 | [0085-orch-discord-events.md](./0085-orch-discord-events.md) |
| ADR-0086 | 학습 범위·문항 수 선택 그룹 컨테이너와 옵션 간격 축소 | Accepted | 2026-10-21 | [0086-selection-group-container.md](./0086-selection-group-container.md) |
| ADR-0087 | 기풀이 표시 기준과 계정·시험 격리 | Accepted | 2026-10-22 | [0087-study-pool-completed-attempts.md](./0087-study-pool-completed-attempts.md) |
| ADR-0088 | 디스패치 큐·콜백 상태 점검 하네스 | Accepted | 2026-10-22 | [0088-harness-dispatch-status.md](./0088-harness-dispatch-status.md) |
| ADR-0089 | 개념 위키 정적 문서와 개인화 추천 점수 | Proposed | 2026-10-22 | [0089-concept-wiki-recommendations.md](./0089-concept-wiki-recommendations.md) |
| ADR-0090 | 런타임 비종속 오케스트레이션 코어와 내구 인박스 | Accepted | 2026-10-22 | [0090-orchestration-runtime-adapters.md](./0090-orchestration-runtime-adapters.md) |
| ADR-0091 | 환영 삽화 외부 생성 API 사용 | Accepted | 2026-10-22 | [0091-welcome-illustrations.md](./0091-welcome-illustrations.md) |
<!-- ADR_INDEX:END -->
