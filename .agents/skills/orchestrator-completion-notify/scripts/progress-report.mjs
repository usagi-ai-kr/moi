#!/usr/bin/env node
// 가중 이벤트 점수에 따라 Discord 진행 현황을 주기 보고한다.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectProgressSnapshot } from './progress-snapshot.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = dirname(SCRIPT_DIR);
const EVENT_FOR_CALLBACK = { blocked: 'callbackBlocked', failed: 'callbackFailed', done: 'callbackDone' };

function readConfig(rootDir) {
  const candidates = [join(rootDir, '.agents/skills/orchestrator-completion-notify/progress-weights.json'), join(SKILL_DIR, 'progress-weights.json')];
  const path = candidates.find(existsSync);
  if (!path) throw new Error('진행 현황 점수 설정 파일이 없습니다');
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (!Number.isInteger(config.threshold) || config.threshold < 1 || !Number.isInteger(config.quietMinutes) || config.quietMinutes < 1 || !Array.isArray(config.milestones) || !config.eventWeights || Object.values(config.eventWeights).some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error('진행 현황 점수 설정이 올바르지 않습니다');
  }
  return config;
}

function asMap(items, keyName, mapValue) {
  return Object.fromEntries((items ?? []).map((item) => [String(item[keyName]), mapValue(item)]));
}

function baseline(snapshot) {
  return {
    pullRequests: asMap(snapshot.pullRequests, 'number', (pr) => ({ state: pr.mergedAt ? 'MERGED' : pr.state, mergeStateStatus: pr.mergeStateStatus ?? null })),
    issues: asMap(snapshot.issues, 'number', (issue) => ({ state: issue.state })),
    ciHealth: snapshot.ci?.health ?? null,
    callbackOffset: snapshot.callbackOffset ?? 0,
  };
}

export function createInitialState(snapshot, now = new Date()) {
  return {
    version: 1,
    score: 0,
    lastReportedAt: now.toISOString(),
    lastCheckedAt: now.toISOString(),
    seenCallbackIds: [],
    ...baseline(snapshot),
  };
}

function addEvent(events, type, config) {
  const weight = config.eventWeights[type];
  if (Number.isInteger(weight) && weight > 0) events.push({ type, weight });
}

export function evaluateProgress(previousState, snapshot, config, now = new Date()) {
  const state = structuredClone(previousState);
  const events = [];
  const checkedAt = now.toISOString();
  const previousPrs = state.pullRequests ?? {};
  for (const pr of snapshot.pullRequests ?? []) {
    const id = String(pr.number);
    const prior = previousPrs[id];
    const currentState = pr.mergedAt ? 'MERGED' : pr.state;
    if (currentState === 'MERGED' && prior?.state !== 'MERGED' && Date.parse(pr.mergedAt ?? checkedAt) > Date.parse(state.lastCheckedAt)) addEvent(events, 'prMerged', config);
    if (prior && currentState === 'OPEN' && pr.mergeStateStatus && prior.mergeStateStatus && pr.mergeStateStatus !== prior.mergeStateStatus) addEvent(events, 'prMergeStateChanged', config);
    if (!prior && currentState === 'OPEN' && Date.parse(pr.createdAt ?? 0) > Date.parse(state.lastCheckedAt)) addEvent(events, 'prOpened', config);
  }

  const previousIssues = state.issues ?? {};
  for (const issue of snapshot.issues ?? []) {
    const id = String(issue.number);
    const prior = previousIssues[id];
    if (prior?.state === 'OPEN' && issue.state === 'CLOSED') addEvent(events, 'issueClosed', config);
    if (prior?.state === 'CLOSED' && issue.state === 'OPEN') addEvent(events, 'issueOpened', config);
    if (!prior && issue.state === 'OPEN' && Date.parse(issue.createdAt ?? 0) > Date.parse(state.lastCheckedAt)) addEvent(events, 'issueOpened', config);
  }
  const oldHealth = state.ciHealth;
  const newHealth = snapshot.ci?.health ?? null;
  if (['green', 'red'].includes(oldHealth) && ['green', 'red'].includes(newHealth) && oldHealth !== newHealth) addEvent(events, 'devCiHealthChanged', config);
  const seenCallbackIds = new Set(state.seenCallbackIds ?? []);
  for (const callback of snapshot.callbackEvents ?? []) {
    const callbackId = callback.id ?? `${callback.at ?? ''}\0${callback.unit ?? ''}\0${callback.status ?? ''}`;
    if (seenCallbackIds.has(callbackId)) continue;
    seenCallbackIds.add(callbackId);
    const type = EVENT_FOR_CALLBACK[callback.status];
    if (type) addEvent(events, type, config);
  }
  state.seenCallbackIds = [...seenCallbackIds].slice(-2000);

  const added = events.reduce((sum, event) => sum + event.weight, 0);
  state.score = (state.score ?? 0) + added;
  Object.assign(state, baseline(snapshot));
  state.lastCheckedAt = checkedAt;
  const quietElapsed = Date.parse(checkedAt) - Date.parse(state.lastReportedAt ?? checkedAt) >= config.quietMinutes * 60_000;
  const reason = state.score >= config.threshold ? 'threshold' : quietElapsed && state.score > 0 ? 'quiet-period' : null;
  return { events, state, shouldReport: Boolean(reason), reason };
}

const cleanText = (value, max = 45) => String(value ?? '').replace(/[^\p{L}\p{N}._:/# -]/gu, '').slice(0, max);

export function formatProgressSummary(snapshot) {
  const merged = (snapshot.pullRequests ?? []).filter((pr) => pr.mergedAt || pr.state === 'MERGED').sort((a, b) => Date.parse(b.mergedAt ?? 0) - Date.parse(a.mergedAt ?? 0))[0];
  const open = (snapshot.pullRequests ?? []).filter((pr) => pr.state === 'OPEN').slice(0, 8);
  const failed = (snapshot.callbackStatuses ?? []).filter((row) => row.status === 'blocked' || row.status === 'failed').slice(0, 5);
  const ciResult = snapshot.ci?.health ?? 'unknown';
  const ciConclusion = cleanText(snapshot.ci?.conclusion ?? '결과 없음', 24);
  const mergedLine = merged ? `최근 병합: #${merged.number} (${cleanText(merged.headRefOid, 7) || 'SHA 없음'})` : '최근 병합: 없음';
  const prsLine = `열린 PR: ${open.length ? open.map((pr) => `#${pr.number} ${cleanText(pr.mergeStateStatus ?? '상태 없음', 16)}`).join(', ') : '없음'}`;
  const ciLine = `dev CI: ${ciResult} (${ciConclusion})`;
  const failedLine = `차단/실패: ${failed.length ? failed.map((row) => `${cleanText(row.unit, 24)}(${row.status})`).join(', ') : '없음'} | 다음: ${failed.length ? '원인 확인 후 담당자에게 재할당' : '다음 변경 감시'}`;
  const milestones = Object.entries(snapshot.milestoneCounts ?? {}).map(([name, count]) => `${cleanText(name, 16)} ${Number(count) || 0}`).join(' · ');
  return [mergedLine, prsLine, ciLine, failedLine, `열린 이슈: ${milestones || '자료 없음'}`].join('\n');
}

function writeState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function sendProgress(rootDir, summary, dryRun = false) {
  if (dryRun) {
    console.log(`progress dry-run\n${summary}`);
    return;
  }
  try {
    execFileSync(process.execPath, [join(SCRIPT_DIR, 'notify-completion.mjs'), '--event', 'progress', '--title', 'moi 진행 현황', '--summary', summary], { cwd: rootDir, stdio: 'ignore' });
  } catch {
    throw new Error('진행 현황 알림 전송에 실패했습니다 (설정·네트워크 확인 필요)');
  }
}

export async function runProgressCycle({ rootDir = process.cwd(), statePath = join(rootDir, 'tmp', 'progress-state.json'), now = new Date(), collect, send } = {}) {
  const config = readConfig(rootDir);
  const existing = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
  const snapshot = await (collect ?? ((offset) => collectProgressSnapshot({ rootDir, callbackOffset: offset, milestones: config.milestones }))) (existing?.callbackOffset ?? 0);
  if (!existing || existing.version !== 1) {
    const initialized = createInitialState(snapshot, now);
    writeState(statePath, initialized);
    return { action: 'initialized', score: 0, sent: false };
  }
  const result = evaluateProgress(existing, snapshot, config, now);
  if (!result.shouldReport) {
    writeState(statePath, result.state);
    return { action: 'checked', score: result.state.score, sent: false };
  }
  try {
    await (send ?? ((current) => sendProgress(rootDir, formatProgressSummary(current))))(snapshot, result.reason);
    result.state.score = 0;
    result.state.lastReportedAt = now.toISOString();
    writeState(statePath, result.state);
    return { action: 'reported', score: 0, sent: true, reason: result.reason };
  } catch {
    writeState(statePath, result.state);
    return { action: 'send-failed', score: result.state.score, sent: false };
  }
}

function parseInterval(value) {
  const match = /^(\d+)(s|m)$/.exec(value ?? '');
  if (!match) throw new Error('--interval은 60s 또는 5m 형식이어야 합니다');
  const ms = Number(match[1]) * (match[2] === 'm' ? 60_000 : 1000);
  if (ms < 5_000) throw new Error('--interval은 5초 이상이어야 합니다');
  return ms;
}

async function main(argv) {
  console.log('progress: worker started');
  let interval = 60_000;
  let once = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--once') once = true;
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--interval') interval = parseInterval(argv[++i]);
    else throw new Error(`알 수 없는 옵션: ${argv[i]}`);
  }
  const rootDir = resolve(process.cwd());
  let stopping = false;
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });
  do {
    try {
      const result = await runProgressCycle({ rootDir, send: (snapshot) => sendProgress(rootDir, formatProgressSummary(snapshot), dryRun) });
      console.log(`progress: action=${result.action} score=${result.score}`);
    } catch (error) {
      console.error(`progress: ${error.message}`);
    }
    if (once || stopping) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, interval));
  } while (!stopping);
}

const modulePath = resolve(fileURLToPath(import.meta.url));
const directEntry = process.argv[1] && basename(process.argv[1]) === basename(modulePath);
const pm2Entry = process.env.pm_exec_path && resolve(process.env.pm_exec_path) === modulePath;
if (directEntry || pm2Entry) {
  void main(process.argv.slice(2));
}
