import { defineConfig } from 'drizzle-kit';

// D1 마이그레이션 골격 (이슈 #1) — 스키마 정의는 0.1.2(#3)에서 추가한다.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/infra/persistence/schema.ts',
  out: './drizzle/migrations',
});
