#!/usr/bin/env node
// 하네스·src 모듈 길이 예산 검사 — AGENTS.md·SKILL.md·ADR·src의 줄/바이트를 예산과 비교한다 (ADR-0015).
// 사용법: node .agents/skills/harness-budget/scripts/check-module-lengths.mjs [--json]   (repo root에서 실행)
// 종료 코드: 0 예산 이내(경고 가능), 1 상한 초과, 2 설정/사용 오류
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const budgetsPath = join(repoRoot, '.agents/skills/harness-budget/scripts/budgets.json');
const asJson = process.argv.includes('--json');
const estimateTokens = (bytes) => Math.ceil(bytes / 3); // 한글 중심 보수 추정

let budgets;
try {
  budgets = JSON.parse(readFileSync(budgetsPath, 'utf8')).budgets;
} catch (err) {
  console.error(`FAIL: budgets.json 로드 실패 (${budgetsPath}): ${err.message}`);
  process.exit(2);
}

// 패턴 확장 — 지원: 정확한 경로(AGENTS.md), 디렉터리 와일드카드(.agents/skills/*/SKILL.md),
// 파일 와일드카드(docs/adr/*.md), 재귀(**)·brace({a,b}) — repo root 기준
// 예: src/**/*.{ts,tsx,css} → src 하위 모든 깊이의 ts/tsx/css. `**` 탐색에서 숨김 디렉터리(.)·node_modules 제외.
function expandBraces(pattern) {
  const start = pattern.indexOf('{');
  if (start === -1) return [pattern];
  const end = pattern.indexOf('}', start);
  if (end === -1) return [pattern];
  const prefix = pattern.slice(0, start);
  const suffix = pattern.slice(end + 1);
  const options = pattern.slice(start + 1, end).split(',');
  return options.flatMap((opt) => expandBraces(prefix + opt + suffix));
}

function segmentToRegExp(seg) {
  let re = '';
  for (const ch of seg) {
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if ('\\^$+.()|[]{}'.includes(ch)) re += `\\${ch}`;
    else re += ch;
  }
  return new RegExp(`^${re}$`);
}

function expandOne(pattern) {
  const segs = pattern.split('/');
  const out = [];
  function rec(absDir, idx, rel) {
    if (idx === segs.length) {
      const abs = join(repoRoot, rel);
      try {
        if (rel && existsSync(abs) && !statSync(abs).isDirectory()) out.push(rel);
      } catch {
        // 무시
      }
      return;
    }
    const seg = segs[idx];
    if (seg === '**') {
      rec(absDir, idx + 1, rel); // 0 depth
      let entries;
      try {
        entries = readdirSync(absDir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (name.startsWith('.') || name === 'node_modules') continue;
        const childAbs = join(absDir, name);
        let isDir = false;
        try {
          isDir = statSync(childAbs).isDirectory();
        } catch {
          continue;
        }
        if (!isDir) continue;
        rec(childAbs, idx, rel ? `${rel}/${name}` : name);
      }
      return;
    }
    if (seg.includes('*') || seg.includes('?')) {
      const re = segmentToRegExp(seg);
      const isLast = idx === segs.length - 1;
      let entries;
      try {
        entries = readdirSync(absDir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (name.startsWith('.') && !seg.startsWith('.')) continue;
        if (name === 'node_modules') continue;
        if (!re.test(name)) continue;
        const childAbs = join(absDir, name);
        let isDir = false;
        try {
          isDir = statSync(childAbs).isDirectory();
        } catch {
          continue;
        }
        const childRel = rel ? `${rel}/${name}` : name;
        if (isLast) {
          if (!isDir) out.push(childRel);
        } else if (isDir) {
          rec(childAbs, idx + 1, childRel);
        }
      }
      return;
    }
    const childAbs = join(absDir, seg);
    const childRel = rel ? `${rel}/${seg}` : seg;
    if (!existsSync(childAbs)) return;
    if (idx === segs.length - 1) {
      try {
        if (!statSync(childAbs).isDirectory()) out.push(childRel);
      } catch {
        // 무시
      }
    } else {
      rec(childAbs, idx + 1, childRel);
    }
  }
  rec(repoRoot, 0, '');
  return out;
}

function expand(pattern) {
  const seen = new Set();
  const out = [];
  for (const p of expandBraces(pattern)) {
    for (const f of expandOne(p)) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  return out;
}

const rows = [];
const violations = [];
const warnings = [];

for (const b of budgets) {
  const files = expand(b.match).filter(
    (f) => !(b.exclude ?? []).some((x) => f.split('/').pop() === x),
  );
  if (files.length === 0) warnings.push(`패턴 '${b.match}'에 해당하는 파일 없음`);
  for (const file of files.sort()) {
    const content = readFileSync(join(repoRoot, file), 'utf8');
    const lines = content === '' ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
    const bytes = Buffer.byteLength(content, 'utf8');
    const over = [];
    if (lines > b.maxLines) over.push(`줄 ${lines}>${b.maxLines}`);
    if (bytes > b.maxBytes) over.push(`바이트 ${bytes}>${b.maxBytes}`);
    const overTarget = lines > b.targetLines;
    const level = over.length ? 'OVER' : overTarget ? 'WARN' : 'OK';
    if (over.length) violations.push(`${file} — ${over.join(', ')} (${b.note})`);
    else if (overTarget) warnings.push(`${file} — 목표 초과 ${lines}>${b.targetLines} (상한 이내)`);
    rows.push({
      file,
      lines,
      bytes,
      tokens: estimateTokens(bytes),
      targetLines: b.targetLines,
      maxLines: b.maxLines,
      maxBytes: b.maxBytes,
      level,
    });
  }
}

if (asJson) {
  console.log(JSON.stringify({ ok: violations.length === 0, modules: rows, violations, warnings }, null, 2));
} else {
  console.log('하네스·src 모듈 길이 예산 검사 (ADR-0015 · 설정: .agents/skills/harness-budget/scripts/budgets.json)');
  console.log('');
  const pad = Math.max(...rows.map((r) => r.file.length), 24);
  console.log(
    `${'모듈'.padEnd(pad)}  ${'줄/목표/상한'.padEnd(16)} ${'바이트/상한'.padEnd(19)} ${'추정토큰'.padEnd(9)} 판정`,
  );
  for (const r of rows) {
    console.log(
      `${r.file.padEnd(pad)}  ${`${r.lines}/${r.targetLines}/${r.maxLines}`.padEnd(16)} ${`${r.bytes}/${r.maxBytes}`.padEnd(19)} ${String(r.tokens).padEnd(9)} ${r.level}`,
    );
  }
  console.log('');
  for (const w of warnings) console.log(`WARN ${w}`);
  if (violations.length) {
    console.log(`FAIL: 예산 초과 ${violations.length}건`);
    for (const v of violations) console.log(`  - ${v}`);
  } else {
    console.log(`OK: ${rows.length}개 모듈 전부 예산 내 (경고 ${warnings.length}건)`);
  }
}

process.exit(violations.length ? 1 : 0);
