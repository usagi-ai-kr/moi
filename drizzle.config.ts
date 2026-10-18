import { defineConfig } from 'drizzle-kit';

// D1 마이그레이션 (이슈 #2/#3, ADR-0003/0004) — 스키마: src/infra/persistence/schema.ts
// 현재: oauth_states(#2) + users/external_identities(#3) + sessions(#4) + 문제은행(#46) + 관리 토큰·멱등(#47).
// forward-only: 자동 down 없음. 적용: `wrangler d1 migrations apply`(원격은 release runbook 참고).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/infra/persistence/schema.ts',
  out: './drizzle/migrations',
});
