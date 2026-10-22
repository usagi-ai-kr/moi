// 진행 보고 점수·상태 회귀 테스트 — node:test, 외부 webhook/GitHub 호출 없음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectProgressSnapshot, readCallbackLog } from './progress-snapshot.mjs';
import { createInitialState, evaluateProgress, formatProgressSummary, runProgressCycle } from './progress-report.mjs';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const CONFIG_PATH = join(SCRIPT_DIR, '..', 'progress-weights.json');
const CONFIG = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const T0 = '2026-10-22T10:00:00.000Z';

function snapshot(overrides = {}) {
  return {
    observedAt: T0,
    pullRequests: [],
    issues: [],
    ci: { status: 'completed', conclusion: 'success', health: 'green', headSha: 'abc1234', url: 'https://example.test/run/1' },
    milestoneCounts: Object.fromEntries(CONFIG.milestones.map((name) => [name, 0])),
    callbackEvents: [],
    callbackStatuses: [],
    callbackOffset: 0,
    ...overrides,
  };
}

test('점수·임계값·보고 간격은 별도 설정 파일에서 관리한다', () => {
  assert.equal(CONFIG.threshold, 6);
  assert.equal(CONFIG.quietMinutes, 60);
  assert.deepEqual(CONFIG.eventWeights, {
    prMerged: 3,
    callbackBlocked: 3,
    callbackFailed: 3,
    callbackDone: 2,
    prOpened: 2,
    devCiHealthChanged: 2,
    prMergeStateChanged: 1,
    issueClosed: 1,
    issueOpened: 1,
  });
});

test('콜백 로그는 pending/전달 완료 중복을 한 이벤트로 세고 최신 상태를 계산한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'moi-progress-callbacks-'));
  const path = join(dir, 'callbacks.log');
  const text = [
    `[${T0}] target=o unit=alpha status=blocked report=/tmp/a.md delivered=pending`,
    `[${T0}] target=o unit=alpha status=blocked report=/tmp/a.md delivered=yes`,
    '[2026-10-22T10:01:00Z] target=o unit=alpha status=done report=/tmp/a.md delivered=yes',
    '',
  ].join('\n');
  writeFileSync(path, text);

  const parsed = readCallbackLog(path, 0);
  assert.deepEqual(parsed.newEvents.map(({ unit, status }) => ({ unit, status })), [
    { unit: 'alpha', status: 'blocked' },
    { unit: 'alpha', status: 'done' },
  ]);
  assert.deepEqual(parsed.callbackStatuses, [{ unit: 'alpha', status: 'done', at: '2026-10-22T10:01:00Z' }]);
  assert.equal(parsed.offset, Buffer.byteLength(text));
});

test('progress snapshot은 gh 자료와 콜백 로그를 읽기 전용으로 모은다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moi-progress-snapshot-'));
  mkdirSync(join(dir, 'tmp'));
  writeFileSync(join(dir, 'tmp', 'callbacks.log'), `[${T0}] target=o unit=stuck status=failed report=/tmp/report.md delivered=yes\n`);
  const commands = [];
  const records = {
    pr: [{ number: 42, state: 'OPEN', createdAt: T0, mergedAt: null, mergeStateStatus: 'DIRTY', headRefOid: 'def5678', baseRefName: 'dev' }],
    issue: [
      { number: 1, state: 'OPEN', createdAt: T0, milestone: { title: '0.2.5' } },
      { number: 2, state: 'OPEN', createdAt: T0, milestone: { title: '0.2.8' } },
    ],
    run: [{ status: 'completed', conclusion: 'success', headSha: 'abc1234', url: 'https://example.test/run/1' }],
  };
  const result = await collectProgressSnapshot({
    rootDir: dir,
    callbackOffset: 0,
    milestones: ['0.2.5', '0.2.8'],
    runGh: (args) => {
      commands.push(args);
      return JSON.stringify(records[args[0]]);
    },
    now: () => new Date(T0),
  });

  assert.deepEqual(commands.map((args) => args[0]), ['pr', 'issue', 'run']);
  assert.equal(result.pullRequests[0].number, 42);
  assert.deepEqual(result.milestoneCounts, { '0.2.5': 1, '0.2.8': 1 });
  assert.deepEqual(result.callbackEvents.map(({ unit, status }) => ({ unit, status })), [{ unit: 'stuck', status: 'failed' }]);
});

test('PR·콜백·CI·이슈 이벤트의 가중치를 합산해 임계값 6에서 보고한다', () => {
  const previous = snapshot({
    pullRequests: [
      { number: 10, state: 'OPEN', createdAt: '2026-10-21T00:00:00Z', mergedAt: null, mergeStateStatus: 'CLEAN' },
      { number: 11, state: 'OPEN', createdAt: '2026-10-21T00:00:00Z', mergedAt: null, mergeStateStatus: 'DIRTY' },
    ],
    issues: [{ number: 3, state: 'OPEN', createdAt: '2026-10-20T00:00:00Z' }],
    ci: { health: 'green', conclusion: 'success' },
  });
  const state = createInitialState(previous, new Date(T0));
  const current = snapshot({
    observedAt: '2026-10-22T10:01:00.000Z',
    pullRequests: [
      { number: 10, state: 'MERGED', createdAt: '2026-10-21T00:00:00Z', mergedAt: '2026-10-22T10:00:10Z', mergeStateStatus: 'CLEAN' },
      { number: 11, state: 'OPEN', createdAt: '2026-10-21T00:00:00Z', mergedAt: null, mergeStateStatus: 'CLEAN' },
      { number: 12, state: 'OPEN', createdAt: '2026-10-22T10:00:20Z', mergedAt: null, mergeStateStatus: 'CLEAN' },
    ],
    issues: [{ number: 3, state: 'CLOSED', createdAt: '2026-10-20T00:00:00Z' }],
    ci: { health: 'red', conclusion: 'failure' },
    callbackEvents: [{ unit: 'blocked-unit', status: 'blocked' }],
  });
  const result = evaluateProgress(state, current, CONFIG, new Date('2026-10-22T10:01:01.000Z'));

  assert.deepEqual(result.events.map(({ type, weight }) => [type, weight]), [
    ['prMerged', 3],
    ['prMergeStateChanged', 1],
    ['prOpened', 2],
    ['issueClosed', 1],
    ['devCiHealthChanged', 2],
    ['callbackBlocked', 3],
  ]);
  assert.equal(result.state.score, 12);
  assert.equal(result.shouldReport, true);
  assert.equal(result.reason, 'threshold');
});

test('60분이 지나도 점수 0이면 건너뛰고, 점수 1 이상이면 보고한다', () => {
  const initial = snapshot();
  const state = createInitialState(initial, new Date(T0));
  const later = snapshot({ observedAt: '2026-10-22T11:00:00.000Z' });
  const noChange = evaluateProgress(state, later, CONFIG, new Date(later.observedAt));
  assert.equal(noChange.shouldReport, false);

  const withChange = evaluateProgress(state, { ...later, callbackEvents: [{ unit: 'done-unit', status: 'done' }] }, CONFIG, new Date(later.observedAt));
  assert.equal(withChange.state.score, 2);
  assert.equal(withChange.shouldReport, true);
  assert.equal(withChange.reason, 'quiet-period');
});

test('pending/yes 콜백 중복은 서로 다른 poll에 도착해도 한 번만 점수화한다', () => {
  const baseline = snapshot();
  const state = createInitialState(baseline, new Date(T0));
  const first = evaluateProgress(state, snapshot({ callbackEvents: [{ id: 'same-callback', unit: 'alpha', status: 'blocked' }] }), CONFIG, new Date('2026-10-22T10:01:00Z'));
  const second = evaluateProgress(first.state, snapshot({ observedAt: '2026-10-22T10:02:00Z', callbackEvents: [{ id: 'same-callback', unit: 'alpha', status: 'blocked' }] }), CONFIG, new Date('2026-10-22T10:02:00Z'));
  assert.equal(first.state.score, 3);
  assert.equal(second.state.score, 3);
  assert.deepEqual(second.events, []);
});

test('첫 실행은 과거 콜백을 세지 않고, 성공 보고 후 점수를 초기화한다', async () => {
  const root = mkdtempSync(join(tmpdir(), 'moi-progress-state-'));
  const skillDir = join(root, '.agents', 'skills', 'orchestrator-completion-notify');
  const statePath = join(root, 'tmp', 'progress-state.json');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'progress-weights.json'), JSON.stringify(CONFIG));
  const baseline = snapshot({ callbackEvents: [{ unit: 'old', status: 'blocked' }], callbackOffset: 100 });
  let sent = 0;

  const first = await runProgressCycle({
    rootDir: root,
    statePath,
    now: new Date(T0),
    collect: async () => baseline,
    send: async () => { sent += 1; },
  });
  assert.equal(first.action, 'initialized');
  assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).score, 0);
  assert.equal(sent, 0);

  const state = createInitialState(baseline, new Date(T0));
  state.score = 6;
  writeFileSync(statePath, JSON.stringify(state));
  const reportSnapshot = snapshot({ observedAt: '2026-10-22T10:01:00.000Z' });
  const second = await runProgressCycle({
    rootDir: root,
    statePath,
    now: new Date('2026-10-22T10:01:01.000Z'),
    collect: async () => ({ ...reportSnapshot, callbackOffset: 100 }),
    send: async () => { sent += 1; },
  });
  const saved = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(second.action, 'reported');
  assert.equal(saved.score, 0);
  assert.equal(saved.lastReportedAt, '2026-10-22T10:01:01.000Z');
  assert.equal(sent, 1);
});

test('보고 요약은 민감한 값 없이 최대 5줄이다', () => {
  const text = formatProgressSummary(snapshot({
    pullRequests: [
      { number: 42, state: 'OPEN', mergeStateStatus: 'CLEAN' },
      { number: 43, state: 'MERGED', mergedAt: T0, headRefOid: 'def5678' },
    ],
    callbackStatuses: [{ unit: 'stuck', status: 'blocked', at: T0 }],
    milestoneCounts: { '0.2.5': 2, '0.2.8': 1 },
  }));
  assert.ok(text.split('\n').length <= 5);
  assert.match(text, /#43/);
  assert.match(text, /CLEAN/);
  assert.match(text, /0\.2\.5 2/);
  assert.ok(!text.includes('webhook'));
  assert.ok(!text.includes('secret'));
});
