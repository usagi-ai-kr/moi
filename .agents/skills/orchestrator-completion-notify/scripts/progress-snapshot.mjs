#!/usr/bin/env node
// GitHub와 o 콜백 로그의 읽기 전용 진행 현황 수집기.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_MILESTONES = ['0.2.5', '0.2.8', '0.2.9', '0.2.10', '0.2.11', '0.2.12'];

function safeJson(raw, label) {
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('not an array');
    return value;
  } catch {
    throw new Error(`${label} 자료를 읽을 수 없습니다`);
  }
}

/** 콜백 로그에서 새 이벤트만 읽고, pending/yes 중복은 하나로 합친다. */
export function readCallbackLog(filePath, startOffset = 0) {
  if (!existsSync(filePath)) return { newEvents: [], callbackStatuses: [], offset: 0 };
  const buffer = readFileSync(filePath);
  const completeEnd = buffer.lastIndexOf(0x0a) + 1;
  const requestedOffset = Math.max(0, Number(startOffset) || 0);
  const offset = requestedOffset > completeEnd ? completeEnd : requestedOffset;
  const allLines = buffer.subarray(0, completeEnd).toString('utf8').split(/\r?\n/);
  const parseLines = (lines) => {
    const events = new Map();
    for (const line of lines) {
      const m = /^\[([^\]]+)\]\s+target=\S+\s+unit=(\S+)\s+status=(done|blocked|failed)\b.*\bdelivered=(pending|yes)\b/.exec(line);
      if (!m) continue;
      const [, at, unit, status] = m;
      const key = `${at}\0${unit}\0${status}`;
      if (!events.has(key) || /delivered=yes\b/.test(line)) events.set(key, { at, unit, status, id: createHash('sha256').update(key).digest('hex') });
    }
    return [...events.values()];
  };
  const newStart = Math.min(offset, completeEnd);
  const newEvents = requestedOffset > completeEnd ? [] : parseLines(buffer.subarray(newStart, completeEnd).toString('utf8').split(/\r?\n/));
  const allEvents = parseLines(allLines);
  const latest = new Map();
  for (const event of allEvents) {
    const prior = latest.get(event.unit);
    if (!prior || Date.parse(event.at) >= Date.parse(prior.at)) latest.set(event.unit, event);
  }
  const callbackStatuses = [...latest.values()].map((event) => ({ at: event.at, unit: event.unit, status: event.status })).sort((a, b) => a.unit.localeCompare(b.unit));
  return { newEvents, callbackStatuses, offset: completeEnd };
}

function defaultRunGh(args, rootDir) {
  try {
    return execFileSync('gh', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error('GitHub 자료 수집에 실패했습니다 (gh 인증·연결 확인 필요)');
  }
}

/** 필요한 필드만 GitHub CLI에서 수집한다. 실행 경로는 모두 읽기 전용이다. */
export async function collectProgressSnapshot({ rootDir, callbackOffset = 0, milestones = DEFAULT_MILESTONES, runGh, now = () => new Date() }) {
  const gh = (args) => runGh ? runGh(args) : defaultRunGh(args, rootDir);
  const [prsRaw, issuesRaw, runsRaw] = await Promise.all([
    gh(['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,state,createdAt,mergedAt,mergeStateStatus,headRefOid,baseRefName']),
    gh(['issue', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,state,createdAt,closedAt,milestone']),
    gh(['run', 'list', '--branch', 'dev', '--workflow', 'ci.yml', '--limit', '1', '--json', 'status,conclusion,headSha,url,createdAt,updatedAt']),
  ]);
  const pullRequests = safeJson(prsRaw, 'PR');
  const issues = safeJson(issuesRaw, '이슈');
  const runs = safeJson(runsRaw, 'CI');
  const ci = runs[0] ?? null;
  if (ci) ci.health = ci.status === 'completed' ? (ci.conclusion === 'success' ? 'green' : 'red') : null;
  const counts = Object.fromEntries(milestones.map((name) => [name, 0]));
  for (const issue of issues) {
    const title = issue.milestone?.title;
    if (issue.state === 'OPEN' && Object.hasOwn(counts, title)) counts[title] += 1;
  }
  const callback = readCallbackLog(join(rootDir, 'tmp', 'callbacks.log'), callbackOffset);
  return {
    observedAt: now().toISOString(),
    pullRequests,
    issues,
    ci: ci ? { status: ci.status, conclusion: ci.conclusion, health: ci.health, headSha: ci.headSha, url: ci.url, updatedAt: ci.updatedAt } : { status: 'missing', conclusion: 'unknown', health: null },
    milestoneCounts: counts,
    callbackEvents: callback.newEvents,
    callbackStatuses: callback.callbackStatuses,
    callbackOffset: callback.offset,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const rootDir = process.cwd();
    const result = await collectProgressSnapshot({ rootDir });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`progress-snapshot: ${error.message}`);
    process.exitCode = 1;
  }
}
