#!/usr/bin/env node
// #134 SAA-C03 시험·도메인·관리 토큰을 D1에 멱등 seed한다.
// - 토큰 원문은 출력하지 않고 SHA-256 hex만 admin_tokens에 넣는다.
// - 원격 D1은 --yes 없이는 거부한다(사고 방지).
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DB = 'moi-db';
const USAGE =
  'usage: node scripts/seed-saa-c03.mjs --local|--remote [--yes] [--admin-token <token>]';

const EXAM = {
  id: 'exam-saa-c03',
  code: 'saa-c03',
  name: 'AWS Certified Solutions Architect – Associate (SAA-C03)',
};
const DOMAINS = [
  { id: 'dom-security', code: 'security', name: '보안', weight: 30 },
  { id: 'dom-resilience', code: 'resilience', name: '복원력', weight: 26 },
  { id: 'dom-performance', code: 'performance', name: '성능', weight: 24 },
  { id: 'dom-cost-optimization', code: 'cost-optimization', name: '비용 최적화', weight: 20 },
];

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** 시험 1행 + 도메인 4행. 기존 행과 충돌하면 무시한다(멱등). */
export function buildSeedSql() {
  const exam = `INSERT INTO exams (id, code, name, created_at) VALUES (${sqlString(EXAM.id)}, ${sqlString(EXAM.code)}, ${sqlString(EXAM.name)}, unixepoch()) ON CONFLICT DO NOTHING;`;
  const domainRows = DOMAINS.map(
    (d) =>
      `  (${sqlString(d.id)}, ${sqlString(EXAM.id)}, ${sqlString(d.code)}, ${sqlString(d.name)}, ${d.weight})`,
  ).join(',\n');
  const domains = `INSERT INTO exam_domains (id, exam_id, code, name, weight) VALUES\n${domainRows}\nON CONFLICT(exam_id, code) DO NOTHING;`;
  return `${exam}\n${domains}`;
}

/** 토큰 원문 대신 SHA-256 hex만 저장한다. 같은 토큰 재실행은 무시된다. */
export function buildTokenSql(token) {
  const tokenHash = createHash('sha256').update(String(token), 'utf8').digest('hex');
  const id = randomUUID();
  return `INSERT INTO admin_tokens (id, token_hash, actor, scope, revoked_at, created_at) VALUES (${sqlString(id)}, ${sqlString(tokenHash)}, 'class-2026-10-22', 'questions:write', NULL, unixepoch()) ON CONFLICT(token_hash) DO NOTHING;`;
}

function parseArgs(argv) {
  const out = { target: null, yes: false, adminToken: null, error: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--local' || arg === '--remote') {
      const target = arg.slice(2);
      if (out.target && out.target !== target) {
        return { ...out, error: '--local과 --remote는 함께 쓸 수 없습니다.' };
      }
      out.target = target;
    } else if (arg === '--yes') {
      out.yes = true;
    } else if (arg === '--admin-token') {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined || value.startsWith('--')) {
        return { ...out, error: '--admin-token 값이 필요합니다.' };
      }
      out.adminToken = value;
    } else if (arg.startsWith('--admin-token=')) {
      out.adminToken = arg.slice('--admin-token='.length);
    } else {
      return { ...out, error: '알 수 없는 인자입니다.' };
    }
  }
  if (!out.target) return { ...out, error: '--local 또는 --remote 중 하나가 필요합니다.' };
  return out;
}

function runWrangler(target, sql) {
  execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', DB, `--${target}`, '--command', sql],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(USAGE);
    console.error(args.error);
    process.exitCode = 2;
    return;
  }
  if (args.adminToken !== null && args.adminToken.trim().length === 0) {
    console.error(USAGE);
    console.error('--admin-token 값이 비어 있습니다.');
    process.exitCode = 2;
    return;
  }
  if (args.target === 'remote' && !args.yes) {
    console.error('원격 D1에는 --yes 없이 적용하지 않습니다.');
    process.exitCode = 2;
    return;
  }

  const statements = [buildSeedSql()];
  const tokenRequested = args.adminToken !== null;
  if (tokenRequested) statements.push(buildTokenSql(args.adminToken));

  try {
    runWrangler(args.target, statements.join('\n'));
  } catch {
    console.error('D1 seed 실패: wrangler 출력을 확인하세요.');
    process.exitCode = 1;
    return;
  }

  console.log(`seed target: ${args.target}`);
  console.log(`exam: 1 (id=${EXAM.id}, code=${EXAM.code})`);
  console.log(`domains: ${DOMAINS.length} (${DOMAINS.map((d) => d.code).join(', ')})`);
  console.log(
    `admin token: ${
      tokenRequested
        ? 'registered (actor=class-2026-10-22, scope=questions:write)'
        : 'skipped (no --admin-token)'
    }`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('D1 seed 실패');
    process.exitCode = 1;
  });
}
