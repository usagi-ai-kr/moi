#!/usr/bin/env node
// 계층 import 경계 정적 스캔 — dependency-cruiser 도입 전 임시 게이트 (ADR-0001).
// 의존성: Node.js (외부 패키지 없음)
// 사용법: node scripts/check-imports.mjs
// 종료 코드: 0 통과, 1 위반, 3 src/ 없음(스킵)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const LAYERS = ['domain', 'app', 'infra', 'ui', 'bootstrap'];

// 계층별 금지 import 대상 계층: ui→app→domain만 허용, infra에서 ui 금지, bootstrap은 전체 허용
const forbiddenLayers = {
  domain: ['app', 'infra', 'ui', 'bootstrap'],
  app: ['infra', 'ui', 'bootstrap'],
  infra: ['ui'],
  ui: ['infra'],
  bootstrap: [],
};

// 계층별 금지 패키지 (휴리스틱)
const forbiddenPkgs = {
  domain: [/^react(-dom)?$/, /^antd$/, /^@ant-design\//, /^hono$/, /^drizzle-orm/, /^pino$/, /^ky$/, /^zustand$/, /^@tanstack\//, /^paseto-ts$/, /^jose$/, /^cloudflare:/],
  app: [/^react(-dom)?$/, /^antd$/, /^@ant-design\//, /^hono$/, /^drizzle-orm/, /^pino$/, /^ky$/, /^zustand$/, /^@tanstack\//, /^paseto-ts$/, /^jose$/, /^cloudflare:/],
  infra: [/^react(-dom)?$/, /^antd$/, /^@ant-design\//, /^zustand$/, /^@tanstack\//],
  ui: [/^drizzle-orm/, /^pino$/, /^paseto-ts$/, /^jose$/, /^cloudflare:/, /^hono$/],
  bootstrap: [],
};

const IMPORT_RE = /(?:import|export)\s[^'"]*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

function layerOf(absPath) {
  const rel = absPath.slice(SRC.length + 1);
  const top = rel.split(sep)[0];
  return LAYERS.includes(top) ? top : null;
}

function importedLayer(spec, fromFile) {
  if (spec.startsWith('.')) {
    const abs = resolve(dirname(fromFile), spec);
    if (abs.startsWith(SRC + sep)) {
      const top = abs.slice(SRC.length + 1).split(sep)[0];
      return LAYERS.includes(top) ? top : null;
    }
    return null;
  }
  // 별칭 휴리스틱: ~~/x, @/x, ~/x, src/x 또는 경로 중간의 /layer/
  const cleaned = spec.replace(/^(~~|~)\//, '').replace(/^@\//, '');
  for (const l of LAYERS) {
    if (cleaned === l || cleaned.startsWith(l + '/') || spec.includes(`/${l}/`)) return l;
  }
  return null;
}

function isPackage(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return false;
  if (/^(~~|~)\//.test(spec) || spec.startsWith('@/')) return false;
  return true;
}

let files;
try {
  files = walk(SRC);
} catch {
  console.log('src/ 없음 — scaffold(0.1.0) 이전: 계층 검사 스킵');
  process.exit(3);
}

const violations = [];
for (const file of files) {
  const layer = layerOf(file);
  if (!layer) continue;
  const rel = file.slice(process.cwd().length + 1);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec) continue;
      if (isPackage(spec)) {
        for (const re of forbiddenPkgs[layer]) {
          if (re.test(spec)) violations.push(`${rel}:${i + 1} [${layer}] 패키지 금지: '${spec}'`);
        }
      } else {
        const target = importedLayer(spec, file);
        if (target && forbiddenLayers[layer].includes(target)) {
          violations.push(`${rel}:${i + 1} [${layer}→${target}] 계층 금지: '${spec}'`);
        }
      }
    }
  });
}

if (violations.length === 0) {
  console.log(`OK: 계층 import 위반 없음 (${files.length}파일 스캔)`);
  process.exit(0);
}
console.log(`FAIL: 계층 import 위반 ${violations.length}건`);
for (const v of violations) console.log(`  ${v}`);
console.log('(단일 행 import 스캔 휴리스틱 — dependency-cruiser 도입 전 보조 게이트)');
process.exit(1);
