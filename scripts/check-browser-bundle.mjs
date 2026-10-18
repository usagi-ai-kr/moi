#!/usr/bin/env node
// 브라우저 번들 검사 (ADR-0011, 이슈 #1/#12): dist/client에 서버 전용 모듈·바인딩 흔적이 없어야 한다.
// `pnpm build`의 마지막 단계로 실행. 위반·산출물 없음 → exit 1.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'dist/client';
const FORBIDDEN = [
  { id: 'workers-runtime', re: /cloudflare:/ },
  { id: 'drizzle', re: /drizzle-orm/ },
  { id: 'paseto', re: /paseto-ts/ },
  { id: 'd1-binding', re: /D1Database/ },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html|css)$/.test(name)) out.push(p);
  }
  return out;
}

let files;
try {
  files = walk(ROOT);
} catch {
  console.error(`FAIL: ${ROOT} 없음 — 먼저 vite build를 실행해야 합니다`);
  process.exit(1);
}

const violations = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) violations.push(`${file}: ${rule.id}`);
  }
}

if (violations.length) {
  console.log(`FAIL: 브라우저 번들에 서버 전용 코드 흔적 ${violations.length}건`);
  for (const v of violations) console.log(`  ${v}`);
  process.exit(1);
}
console.log(`OK: 브라우저 번들 검사 통과 (${files.length}파일 — 서버 전용 모듈·바인딩 없음)`);
