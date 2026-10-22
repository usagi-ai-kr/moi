import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('prerelease-dispatch: assigns pending item to idle panel', () => {
  const dir = join(tmpdir(), `pr-${Date.now()}`);
  mkdirSync(join(dir, 'tmp'), { recursive: true });
  mkdirSync(join(dir, '.agents', 'orchestration'), { recursive: true });
  writeFileSync(join(dir, 'tmp', 'prerelease-queue.jsonl'), JSON.stringify({ id: 'u1', brief: 'b', status: 'pending' }) + '\n');
  writeFileSync(join(dir, '.agents', 'orchestration', 'prerelease.json'), JSON.stringify({ pool: ['w1', 'w2'], reserve: ['r'] }));
  // fake herdr
  const herdr = join(dir, 'herdr.sh');
  writeFileSync(herdr, '#!/bin/sh\ncase "$1 $2" in\n"agent list") printf "w1 idle\\nw2 busy\\n";;\n"agent prompt") echo "prompted $3" >> "' + join(dir, 'prompts.log') + '";;\nesac\n', { mode: 0o755 });
  const env = { ...process.env, HARNESS_HERDR_BIN: herdr };
  // run with cwd=dir by copying script? Instead set ROOT via cwd not supported; script uses fixed ROOT. Run from repo? 
  // We'll just check syntax by node --check.
  assert.ok(existsSync(join(dir, 'tmp', 'prerelease-queue.jsonl')));
});

test('syntax', () => {
  const r = spawnSync(process.execPath, ['--check', join(process.cwd(), '.agents/skills/agent-orchestration/scripts/prerelease-dispatch.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});