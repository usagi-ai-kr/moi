# moi 오케스트레이터 인수인계 — 2026-10-20 (2차 정지)

> 이 문서가 `2026-10-19-*.md`와 이 파일의 1차 판(PR #175, `24c11f0`)보다 우선한다. 사용자 지시("인수인계를 위한 이슈와 프롬프트만 남기고 모두 중지")로 정지한 시점의 스냅샷이다. 다음 o는 8장 프롬프트로 시작하고 상태를 직접 다시 확인한다.

## 0. 요약
- 기준: dev `b6a3079`(CI success). 수업은 2026-10-22.
- 1차 인계 이후 병합 15건: #171, #173~#175, #177, #180, #181, #183, #190~#196.
- 배포: dev `63098c1` 기준(3장). dev와의 차이는 ADR 문서뿐이라 재배포가 필요 없다.
- 정지 절차·절대 경로 규칙은 ADR-0048로 기록했다(`agent-orchestration` 스킬 반영).

## 1. 역할과 패널 (ADR-0042)
| 역할 | 패널 | 에이전트(모델) |
| --- | --- | --- |
| o | w17:p1 | Codex/Claude (오케스트레이터) |
| r | w17:p3 | OpenCode (GLM-5.3-Flash max, 사용자 교체) |
| w1 | w17:p2 | OpenCode (DeepSeek V4.1 Flash) |
| w2 | w17:p7 | OpenCode (Muse Spark 1.3) |
| w3 | w17:p6 | OpenCode (MiniMax M3.1 Flash Free) |
- 패널 ID는 `herdr tab list --workspace w17`, `herdr agent list`로 재확인한다. 정지 시 4패널 모두 중지 프롬프트를 받고 대기 중이다.
- 콜백: `sh /Users/young-mini/Workspace/moi/.agents/skills/agent-orchestration/scripts/notify.sh w17:p1 <unit> <status> <report>`.
- 브리프·보고서: `$TMPDIR/opencode/moi-work/`(절대 경로로 전달). 상태 메모: `resume-current.md`. 폴백 타이머는 해제했다.
- 사용자 지시: 서브에이전트 금지, 기존 패널에 균형 분배, 재배포 후 알림, 0.2.x 자율 진행, Pele 0.2.4 편입.

## 2. 배포 상태 (#146)
- URL: https://moi.qus0in.workers.dev / 버전 `61c13d57-068e-4119-b13a-f2a176f44add` / dev `63098c1`
- 롤백 대상: `2304b188-b433-4dd3-9bd2-3284fef60892`. DB·Secrets 변경 없음, 원격 미적용 migration 0.
- 확장 smoke·자산 hash 일치·Kakao 시작 17항목 통과. Lighthouse 모바일 98/100/96/100.
- 이 배포본은 Mermaid를 쓴다(Pele 미반영).
- 사용자 몫: 실계정 로그인 → 10문항 → 새로고침 복원 → 제출/해설 → 오답·북마크 → 로그아웃.

## 3. 열린 PR·브랜치
| 대상 | 내용 | 상태 | 다음 |
| --- | --- | --- | --- |
| PR #197 `fix/52-draft-retry` `30078c6` | 저장소 quota + 네트워크 동시 실패 시 답안 재전송(#52) | 8게이트 통과, CI success, r 승인(차단 0) | o 최종 수락 → squash 병합 |
| `feat/179-pele-renderer` `4164012`(push됨, PR 없음) | Pele lazy 렌더러 + SVG sanitizer, Mermaid 의존성 제거 | w2 전체 게이트 통과(unit 585·integration 215·BDD 41). Draft PR 생성은 정지로 중단 | w3 독립 검증(4장) → r 리뷰 → PR |
| `fix/132-review-typography` `150eb9e`(push됨, WIP) | 복습 보조텍스트 12/14→16px, 미정의 `success`/`card` 색 클래스를 기존 토큰으로 치환 | **게이트·브라우저 실측 미검증**. 정지 때문에 o가 보존용 WIP 커밋을 남겼다 | 브리프 `brief-132-review-type.md` 기준으로 Red/Green 실측 → 게이트 → 리뷰 |
| PR #133 | 0.3 라이선스 페이지(Draft) | 보존, 0.2에 병합 금지 | — |

## 4. 중단된 단위
- **179-validation(w3)**: `brief-179-validation.md`. 실제 `Explanation → renderPeleDiagram → sanitizePeleSvg` 경로로 71개 도식 전수, 공격 샘플 15종 이상, 5 viewport × light/dark, cold/warm 성능 측정. 시작 전 정지, `scripts/pele-validation/`·`docs/evidence/179-pele/`은 아직 없다. 검증 통과 전 Pele 병합·배포 금지(ADR-0047).
- **132-review-type(w1)**: 3장 참조.
- 정리 대상 worktree(병합 완료): `189-result-pager`, `179-pele-scope`, `final-evidence`, `deploy-dev`, `perf-baseline-8bad361`. 보류: `132-lcp-shell`(병합 금지), `168-mermaid-inventory`(PoC 참고용), `bdd-flake`(변경 없음).
- 잔여 프로세스: `vite preview --port 4175`(04:41 경과)와 Playwright test-server 2개가 떠 있다. 소유를 확인한 뒤에만 종료한다.

## 5. 남은 일 (우선순위)
1. PR #197 수락·병합 → 재배포 여부 판단(UI 동작 변경이므로 수업 전 배포 권장, `release-deploy-workers`).
2. #132 typography WIP 검증·리뷰·병합.
3. #179 Pele: w3 검증 → r 리뷰 → PR → 병합 → 배포. 수업(10-22) 직전이면 사용자에게 배포 시점을 확인한다.
4. 감사 후속 후보(`report-02-ui-ac-audit.md`, `report-02-content-audit.md`): 단일/복수 유형 힌트 부재(DTO 계약 판단 필요), 콘텐츠 재등록 시 UUID 중복 위험 문서화.
5. 0.2 열린 이슈(#148, #146, #134, #132, #131, #127 등)는 사용자 검증 항목과 구분하고 성급하게 닫지 않는다.

## 6. 1차 인계 이후 바뀐 계약
- 학습 세트 10문제(#187), 근거 링크는 문서명 표시(#188), 결과 해설 좌우 페이징(#189), Pass 즉시 다음 문제(#185).
- Mermaid 라벨 예약 문자 인용 + 품질 규칙 10(#177). Pele 채택(ADR-0045) → 0.2.4 편입(ADR-0047).
- CI `check:notices` 게이트(#174). 리뷰 폴백: r 병목 시 다른 모델의 유휴 w가 리뷰(#195).

## 7. 주의
- 비밀값·토큰·쿠키·DB export 내용을 저장소·이슈·PR에 남기지 않는다.
- 원격 D1 쓰기·Secrets 변경은 #127 승인 범위 안에서만 한다.
- main 병합·태그·Release는 정식 릴리스 때만(4종 산출물). 수업용 배포는 dev에서 한다.
- `$TMPDIR`는 `/var/...`와 `/private/var/...`로 표기가 섞인다. 보고서는 절대 경로로 확인한다.

## 8. 다음 오케스트레이터 재개 프롬프트
```
moi o 역할로 재개. 먼저 docs/handover/2026-10-20-orchestrator-handover.md와 #176을 읽어라.
- 확인: git fetch → dev SHA, PR #197 CI/리뷰, feat/179-pele-renderer·fix/132-review-typography HEAD, herdr w17 패널 상태.
- 규칙: AGENTS.md, agent-orchestration(ADR-0042/0048). o는 직접 구현하지 않는다. 서브에이전트 금지, 기존 패널에 분배.
- 순서: #197 수락·병합 → 재배포 판단 → 132-review-type 검증 단위(w1) → 179-validation(w3) → Pele r 리뷰.
- 브리프·보고서는 $TMPDIR/opencode/moi-work/ 절대 경로, 압축형 bullet. 폴백 타이머 1개·15분.
- 배포·원격 D1·Pele 배포 시점은 사용자 승인 범위를 확인한 뒤에만 한다.
```
