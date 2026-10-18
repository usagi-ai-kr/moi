## 무엇/왜

<!-- 무엇을 왜 바꾸는지 2~3줄로 요약한다. 관련 이슈와 합의를 적는다. -->
- 관련 이슈: Closes #
- 배경:

## 변경 범위

<!-- 코드·문서·설정 중 해당 항목만 남긴다. -->
- [ ] `src/` 제품 코드
- [ ] 문서(`AGENTS.md`·스킬·ADR·README)
- [ ] 설정·CI·스크립트

## 테스트

<!-- 위치·실행 명령·결과를 기록한다. 해당 없음은 사유와 함께 적는다. -->
| 게이트 | 명령 | 결과 |
| --- | --- | --- |
| lint | `pnpm run lint` | |
| typecheck | `pnpm run typecheck` | |
| check:architecture | `pnpm run check:architecture` | |
| test:unit | `pnpm run test:unit` | |
| test:integration | `pnpm run test:integration` | |
| test:bdd | `pnpm run test:bdd` | |
| build | `pnpm run build` | |

- 스킬 검증: `node .agents/scripts/validate-skills.mjs` —
- 하네스 예산: `node .agents/skills/harness-budget/scripts/check-module-lengths.mjs` —

## 배포

- 배포 URL: <!-- 해당 없으면 "해당 없음(문서 전용)" -->
- commit SHA:
- DB migration 내역: <!-- 해당 없으면 "없음" -->

## 스크린샷·viewport

<!-- UI 변경 시에만 작성한다. 핵심 화면은 320/375/768/1024/1280, 보조는 375/768/1280. -->
- [ ] 해당 없음(비UI 변경)
- [ ] Lighthouse 결과(해당 시):

## 남은 blocker

<!-- 없으면 "없음". 있으면 해결 계획과 함께 적는다. -->
- 없음

## 비밀값 확인

- [ ] 토큰·쿠키·인가 코드·Secret·개인정보를 본문·코드·로그에 남기지 않았다
