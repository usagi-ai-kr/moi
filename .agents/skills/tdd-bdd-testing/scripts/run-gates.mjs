#!/usr/bin/env node
// CI와 동일한 품질 게이트를 로컬에서 순차 실행한다 (ADR-0007).
// 의존성: Node.js + pnpm
// 사용법: node scripts/run-gates.mjs [gate ...]  (기본: CI와 동일한 전체 목록)
// 미정의 스크립트는 건너뛰고 요약만 출력한다. 실패 시 exit 1.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DEFAULT_GATES = ['lint', 'typecheck', 'check:architecture', 'test:unit', 'test:integration', 'test:bdd', 'build'];
const gates = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_GATES;

let pkg;
try {
  pkg = JSON.parse(readFileSync('package.json', 'utf8'));
} catch {
  console.log('package.json 없음 — scaffold(0.1.0) 이전: 게이트 스킵');
  process.exit(0);
}

const scripts = pkg.scripts ?? {};
const failed = [];
for (const gate of gates) {
  if (!scripts[gate]) {
    console.log(`SKIP ${gate} (package.json에 미정의 — 0.x 단계에서 순차 활성화)`);
    continue;
  }
  console.log(`\n▶ pnpm run ${gate}`);
  const r = spawnSync('pnpm', ['run', gate], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(gate);
}

console.log(failed.length ? `\nFAIL: ${failed.join(', ')}` : '\nOK: 모든 게이트 통과');
process.exit(failed.length ? 1 : 0);
