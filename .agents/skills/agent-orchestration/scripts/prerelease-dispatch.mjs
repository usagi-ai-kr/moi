#!/usr/bin/env node
// 사전 작업 배분 스케줄러 (이슈 #338 하위).
// 사용법: node prerelease-dispatch.mjs [--once] [--interval <sec>]
// 입력: tmp/prerelease-queue.jsonl ({id,brief,status}), 설정 .agents/orchestration/prerelease.json, 상태 tmp/prerelease-state.json
// 쓰기 없음: 보고만 하고 자동 배정은 하지 않는다? 아니, 이 스크립트는 pending 항목을 idle pool 패널에 전송한다.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..', '..');

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function herdrBin() {
  return process.env.HARNESS_HERDR_BIN || 'herdr';
}

function herdrList() {
  try {
    const out = execFileSync(herdrBin(), ['agent', 'list'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out;
  } catch {
    return '';
  }
}

function isIdlePanel(list, panel) {
  // herdr list 출력에서 패널 이름과 idle 상태를 찾는다. 형식은 가정하지 않고 이름+idle 문자열을 찾는다.
  const lines = String(list).split(/\r?\n/);
  for (const line of lines) {
    if (line.includes(panel) && /idle/i.test(line)) return true;
  }
  return false;
}

function assign(item, panel) {
  try {
    execFileSync(herdrBin(), ['agent', 'prompt', panel, `[사전 작업] tmp/brief-${item.id}.md 를 수행하라`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runOnce() {
  const queuePath = join(ROOT, 'tmp', 'prerelease-queue.jsonl');
  const cfgPath = join(ROOT, '.agents', 'orchestration', 'prerelease.json');
  const statePath = join(ROOT, 'tmp', 'prerelease-state.json');

  const cfg = readJson(cfgPath, { pool: [], reserve: [] });
  const pool = Array.isArray(cfg.pool) ? cfg.pool : [];
  const reserve = new Set(Array.isArray(cfg.reserve) ? cfg.reserve : []);
  const candidates = pool.filter((p) => !reserve.has(p));

  const queue = readJsonl(queuePath);
  const pending = queue.filter((q) => q && q.id && (q.status === 'pending' || !q.status));

  const state = readJson(statePath, { assigned: {} });
  if (!state.assigned || typeof state.assigned !== 'object') state.assigned = {};

  const list = herdrList();

  let changed = false;
  for (const item of pending) {
    if (state.assigned[item.id]) continue; // 이미 assigned
    // idle pool 패널 찾기
    let chosen = null;
    for (const panel of candidates) {
      if (isIdlePanel(list, panel) && !Object.values(state.assigned).includes(panel)) {
        chosen = panel;
        break;
      }
    }
    if (!chosen) continue;
    if (assign(item, chosen)) {
      state.assigned[item.id] = { panel: chosen, at: new Date().toISOString() };
      changed = true;
      console.log(`assigned ${item.id} -> ${chosen}`);
    }
  }
  if (changed) {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } else {
    console.log('no assignments');
  }
}

const args = process.argv.slice(2);
const once = args.includes('--once');
const intervalIdx = args.indexOf('--interval');
const interval = intervalIdx >= 0 ? Number(args[intervalIdx + 1]) || 0 : 0;

if (once || interval <= 0) {
  runOnce();
} else {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    runOnce();
    await new Promise((r) => setTimeout(r, interval * 1000));
  }
}