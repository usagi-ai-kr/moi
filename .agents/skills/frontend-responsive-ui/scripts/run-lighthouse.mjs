#!/usr/bin/env node
// Lighthouse 재현 실행 — 4개 카테고리(perf/a11y/bp/seo)를 측정·판정한다 (ADR-0014).
// 사용법: node .agents/skills/frontend-responsive-ui/scripts/run-lighthouse.mjs [url] [--desktop] [--runs N] [--min 90]
//   URL 생략 시: pnpm build → vite preview(127.0.0.1:4173) 자동 기동 후 측정.
// 환경변수: CHROME_PATH(Chrome 실행 파일 경로, 선택). repo root에서 실행.
// 종료 코드: 0 전 회차·전 카테고리 기준 이상, 1 미달/실행 오류, 2 사용 오류
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const argv = process.argv.slice(2);
const getArg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const url = argv.find((a) => /^https?:\/\//.test(a));
const desktop = argv.includes('--desktop');
const runs = Number(getArg('--runs') ?? '1');
const min = Number(getArg('--min') ?? '90');

if (!Number.isInteger(runs) || runs < 1 || !Number.isFinite(min)) {
  console.error('사용 오류: --runs(정수 ≥1) / --min(숫자) 확인');
  process.exit(2);
}

const base = url ?? 'http://127.0.0.1:4173';
// Chrome 실행 파일: CHROME_PATH 우선, 없으면 macOS 기본 경로 자동 감지 (ADR-0014)
const detectedChrome =
  process.env.CHROME_PATH ??
  (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined);
const lighthouseEnv = detectedChrome ? { ...process.env, CHROME_PATH: detectedChrome } : process.env;
let preview = null;
const cleanup = () => {
  if (preview && preview.exitCode === null) preview.kill('SIGTERM');
};
process.on('exit', cleanup);

const waitFor = async (target, timeoutMs) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if ((await fetch(target)).ok) return true;
    } catch {
      // 재시도
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

const fail = (msg) => {
  console.log(`FAIL: ${msg}`);
  process.exit(1);
};

if (!url) {
  console.log('▶ pnpm build');
  if (spawnSync('pnpm', ['run', 'build'], { stdio: 'inherit' }).status !== 0) fail('빌드 실패');
  console.log('▶ vite preview (127.0.0.1:4173)');
  preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    stdio: 'ignore',
  });
  if (!(await waitFor(base, 60000))) fail('preview 기동 실패');
}

const dir = mkdtempSync(join(tmpdir(), 'moi-lighthouse-'));
const worst = Object.fromEntries(CATEGORIES.map((c) => [c, 101]));
for (let run = 1; run <= runs; run += 1) {
  const out = join(dir, `${desktop ? 'desktop' : 'mobile'}-${run}.json`);
  const args = [
    'exec',
    'lighthouse',
    base,
    '--quiet',
    '--output',
    'json',
    '--output-path',
    out,
    `--only-categories=${CATEGORIES.join(',')}`,
  ];
  if (desktop) args.push('--preset=desktop');
  if (spawnSync('pnpm', args, { stdio: 'inherit', env: lighthouseEnv }).status !== 0)
    fail('lighthouse 실행 실패');
  const report = JSON.parse(readFileSync(out, 'utf8'));
  const scores = Object.fromEntries(
    Object.entries(report.categories).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)]),
  );
  for (const c of CATEGORIES) worst[c] = Math.min(worst[c], scores[c]);
  console.log(`run ${run}: ${CATEGORIES.map((c) => `${c} ${scores[c]}`).join(' · ')}`);
}

console.log(`\nLighthouse ${desktop ? '데스크탑' : '모바일'} · ${base} · ${runs}회 · 기준 ≥${min}`);
for (const c of CATEGORIES) {
  console.log(`${c.padEnd(14)} ${String(worst[c]).padStart(3)} ${worst[c] >= min ? 'OK' : 'FAIL'}`);
}
const failedCats = CATEGORIES.filter((c) => worst[c] < min);
if (failedCats.length) fail(`기준 미달: ${failedCats.join(', ')} (원인·후속을 PR/이슈에 기록)`);
console.log('OK: 전 카테고리 기준 이상');
cleanup();
