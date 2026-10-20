// #121 Phase 1 — pnpm-lock 고정 prod 의존성으로 THIRD_PARTY_NOTICES.md 생성.
// 사용: node scripts/generate-third-party-notices.mjs [--output <경로>] [--check] [--help]
// --check: 기존 파일과 재생성 결과를 비교만 하고 다르면 exit 1. 새 의존성 추가 없음.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NEEDS_REVIEW,
  checkLockfileConsistency,
  expandEntryVersions,
  findMissingDirectProdDeps,
  findMissingInLockfile,
  findPureDevOnly,
  readLicenseHit,
  sortNotices,
  toNoticeEntry,
  renderNotices,
} from './lib/third-party-notices.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = resolve(ROOT, 'THIRD_PARTY_NOTICES.md');

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--output') args.output = resolve(ROOT, argv[i + 1] ?? '');
    else if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--help') args.help = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('사용: node scripts/generate-third-party-notices.mjs [--output <경로>] [--check]');
    return;
  }
  const packageJsonText = readFileSync(resolve(ROOT, 'package.json'), 'utf8');
  const lockfileText = readFileSync(resolve(ROOT, 'pnpm-lock.yaml'), 'utf8');
  const { ok, problems } = checkLockfileConsistency({ packageJsonText, lockfileText });
  if (!ok) {
    console.error(`package.json↔pnpm-lock.yaml 불일치:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  const pkg = JSON.parse(packageJsonText);
  const raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  const groups = JSON.parse(raw);
  const flat = Object.values(groups).flat();
  const entries = [];
  for (const e of flat) {
    for (const v of expandEntryVersions(e)) {
      let installed = {};
      let hit = '';
      if (v.path) {
        try {
          installed = JSON.parse(readFileSync(resolve(v.path, 'package.json'), 'utf8'));
        } catch { installed = {}; }
        try { hit = readLicenseHit(v.path); } catch { hit = ''; }
      }
      entries.push(
        toNoticeEntry(
          { name: v.name, version: v.version, license: e.license, homepage: e.homepage },
          installed,
          hit,
        ),
      );
    }
  }
  const missing = findMissingInLockfile(entries, lockfileText);
  if (missing.length > 0) {
    console.error(`lockfile에 없는 버전:\n- ${missing.join('\n- ')}`);
    process.exit(1);
  }
  const missingDirect = findMissingDirectProdDeps(
    entries.map((e) => e.name), Object.keys(pkg.dependencies || {}),
  );
  if (missingDirect.length > 0) {
    console.error(`prod 직접 의존성 누락(--prod 수집 범위 확인):\n- ${missingDirect.join('\n- ')}`);
    process.exit(1);
  }
  const devOnly = findPureDevOnly(
    entries.map((e) => e.name), Object.keys(pkg.devDependencies || {}), Object.keys(pkg.dependencies || {}),
  );
  const sorted = sortNotices(entries);
  const markdown = renderNotices(sorted, { lockfile: 'pnpm-lock.yaml', count: sorted.length });
  if (args.check) {
    const current = existsSync(args.output) ? readFileSync(args.output, 'utf8') : null;
    if (current !== markdown) {
      console.error(`드리프트: ${args.output} 재생성 결과가 다릅니다. 스크립트를 실행해 갱신하세요.`);
      process.exit(1);
    }
    console.log(`ok: ${sorted.length}개, 드리프트 없음`);
    return;
  }
  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, markdown);
  const needs = sorted.filter((e) => e.copyright === NEEDS_REVIEW || e.license === NEEDS_REVIEW);
  console.error(`기록 ${sorted.length}개, '${NEEDS_REVIEW}' ${needs.length}개: ${needs.map((e) => e.name).join(', ') || '없음'}`);
  if (devOnly.length > 0) console.error(`참고(dev에도 등록된 prod 경유 패키지): ${devOnly.join(', ')}`);
}

main();
