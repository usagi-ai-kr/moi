#!/usr/bin/env node
// CI와 동일한 품질 게이트를 로컬에서 순차 실행한다 (ADR-0007, fail-closed — 이슈 #10).
// 의존성: Node.js + pnpm
// 사용법: node .agents/skills/tdd-bdd-testing/scripts/run-gates.mjs [gate ...]  (기본: CI와 동일한 필수 목록)
// - package.json이 **파일 자체로 없을 때만**(ENOENT) 0.1.0 이전 임시 예외로 exit 0.
// - 파일이 존재하나 읽기/JSON 파싱 오류면 exit 1(FAIL) — 'pre-scaffold 예외'로 위장 금지.
// - 필수 게이트 미정의·실행 실패도 모두 FAIL로 집계하고 exit 1.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DEFAULT_GATES = ['lint', 'typecheck', 'check:architecture', 'test:unit', 'test:integration', 'test:bdd', 'build'];
const gates = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_GATES;

if (!existsSync('package.json')) {
  console.log('package.json 없음(ENOENT) — scaffold(0.1.0) 이전 임시 예외: 게이트 스킵 (package.json 생성 시 예외 자동 종료)');
  process.exit(0);
}

let pkg;
try {
  pkg = JSON.parse(readFileSync('package.json', 'utf8'));
} catch (err) {
  console.log(`FAIL package.json 읽기/파싱 오류: ${err.message}`);
  console.log('\nFAIL: package.json (fail-closed — 파일이 있으면 유효해야 한다)');
  process.exit(1);
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
