import { defineConfig } from 'drizzle-kit';

// D1 마이그레이션 (이슈 #2/#3, ADR-0003/0004) — 스키마: schema.ts + schema-reports.ts(#53) + schema-attempts.ts(#54) + schema-corrections.ts(#53) + schema-review.ts(#54/#51) + schema-review-bookmarks.ts(#51)
// 현재: oauth_states(#2) + users/external_identities(#3) + sessions(#4) + 문제은행(#46) + 관리 토큰·멱등(#47) + 학습 세트(#49) + 신고·재검수(#53) + 풀이 기록(#54) + 정정 이벤트(#53) + 복습 회차(#54/#51) + 복습 북마크(#51).
// forward-only: 자동 down 없음. 적용: `wrangler d1 migrations apply`(원격은 release runbook 참고).
export default defineConfig({
  dialect: 'sqlite',
  schema: [
    './src/infra/persistence/schema.ts',
    './src/infra/persistence/schema-reports.ts',
    './src/infra/persistence/schema-attempts.ts',
    './src/infra/persistence/schema-corrections.ts',
    './src/infra/persistence/schema-review.ts',
    './src/infra/persistence/schema-review-bookmarks.ts',
  ],
  out: './drizzle/migrations',
});
