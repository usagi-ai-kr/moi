#!/usr/bin/env node
// CI와 동일한 품질 게이트를 로컬에서 순차 실행한다 (ADR-0007, fail-closed — 이슈 #10).
// 의존성: Node.js + pnpm
// 사용법: node .agents/skills/tdd-bdd-testing/scripts/run-gates.mjs [gate ...]  (기본: CI와 동일한 필수 목록)
// - package.json이 없으면(0.1.0 이전 임시 예외) 안내 후 exit 0 — package.json 생성 시 예외 종료.
// - package.json이 있으면 필수 게이트 미정의·실행 실패를 모두 FAIL로 집계하고 exit 1.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DEFAULT_GATES = ['lint', 'typecheck', 'check:architecture', 'test:unit', 'test:integration', 'test:bdd', 'build'];
const gates = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_GATES;

let pkg;
try {
  pkg = JSON.parse(readFileSync('package.json', 'utf8'));
} catch {
  console.log('package.json 없음 — scaffold(0.1.0) 이전 임시 예외: 게이트 스킵 (package.json 생성 시 예외 자동 종료)');
  process.exit(0);
}

const scripts = pkg.scripts ?? {};
const missing = gates.filter((g) => !scripts[g]);
const failed = [];

for (const gate of gates) {
  if (!scripts[gate]) {
    console.log(`FAIL ${gate} (package.json에 미정의 — fail-closed)`);
    continue;
  }
  console.log(`\n▶ pnpm run ${gate}`);
  const r = spawnSync('pnpm', ['run', gate], { stdio: 'inherit' });
  if (r.error) {
    console.log(`FAIL ${gate} (실행 오류: ${r.error.message})`);
    failed.push(gate);
  } else if (r.status !== 0) {
    failed.push(gate);
  }
}

if (missing.length || failed.length) {
  console.log(`\nFAIL: ${[...missing, ...failed].join(', ')} (미정의 ${missing.length}건·실패 ${failed.length}건)`);
  process.exit(1);
}
console.log('\nOK: 모든 게이트 통과');
