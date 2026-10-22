#!/usr/bin/env node
// 콜백 릴레이: callbacks.log의 delivered=pending 항목을 o(claude-o)가 idle일 때 herdr로 전달한다.
// 사용법: node callback-relay.mjs [--once] [--interval=30] [--log=<path>] [--target=claude-o]
// 전달 성공 시 delivered=yes 기록. 실패·o 작업 중이면 pending 유지 후 다음 주기에 재시도(유실 없음).
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=');
  return [k, v];
}));
const logFile = resolve(args.log ?? 'tmp/callbacks.log');
const target = args.target ?? 'claude-o';
const intervalSec = Number(args.interval ?? 30);
const once = args.once === 'true';

const line = (s) => s.match(/^\[(?<ts>[^\]]+)\] target=(?<target>\S+) unit=(?<unit>\S+) status=(?<status>\S+) report=(?<report>\S+) delivered=(?<delivered>\S+)$/)?.groups;

// (unit, report)별 마지막 기록만 본다. 마지막이 pending이면 미전달(재보고는 다시 전달).
function pendingCallbacks() {
  if (!existsSync(logFile)) return [];
  const latest = new Map();
  for (const raw of readFileSync(logFile, 'utf8').split('\n')) {
    const g = line(raw.trim());
    if (g) latest.set(`${g.unit}|${g.report}`, g);
  }
  return [...latest.values()].filter((g) => g.delivered === 'pending');
}

function targetIdle() {
  const out = execFileSync('herdr', ['agent', 'list'], { encoding: 'utf8', timeout: 10000 });
  const agents = JSON.parse(out).result?.agents ?? [];
  const agent = agents.find((a) => a.name === target);
  return agent?.agent_status === 'idle';
}

function deliver(items) {
  const body = `[callback] ${items.length}건: ` + items.map((g) => `unit=${g.unit} status=${g.status} report=${g.report}`).join(" | ");
  execFileSync("herdr", ["agent", "prompt", target, body], { encoding: "utf8", timeout: 20000, stdio: "pipe" });
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  for (const g of items) appendFileSync(logFile, `[${ts}] target=${g.target} unit=${g.unit} status=${g.status} report=${g.report} delivered=yes\n`);
}

function tick() {
  const items = pendingCallbacks();
  if (items.length === 0) return;
  let idle;
  try {
    idle = targetIdle();
  } catch (e) {
    console.error(`[relay] herdr 상태 확인 실패: ${e.message.split('\n')[0]}`);
    return;
  }
  if (!idle) {
    console.log(`[relay] ${target} 작업 중 — 대기 ${items.length}건`);
    return;
  }
  try {
    deliver(items);
    console.log(`[relay] 전달: ${items.length}건`);
  } catch (e) {
    console.error(`[relay] 전달 실패: ${e.message.split("\n")[0]}`);
  }
}

tick();
if (!once) setInterval(tick, intervalSec * 1000);
