#!/usr/bin/env node
// 하네스 자체 검증 — Agent Skills 표준(https://agentskills.io/specification) + moi 규칙(SKILL.md + scripts/ 필수, AGENTS.md 스킬 인덱스 등록)
// 사용법: node .agents/scripts/validate-skills.mjs [skills-dir]
// 종료 코드: 0 정상, 1 위반, 2 사용 오류
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd(), process.argv[2] ?? '.agents/skills');
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errors = [];
const warnings = [];

let entries = [];
try {
  entries = readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory());
} catch {
  console.error(`스킬 디렉터리를 찾을 수 없음: ${root}`);
  process.exit(2);
}

if (entries.length === 0) errors.push(`${root}: 스킬 디렉터리 없음`);

for (const dir of entries) {
  const skillMd = join(root, dir, 'SKILL.md');
  if (!existsSync(skillMd)) {
    errors.push(`${dir}: SKILL.md 없음`);
    continue;
  }
  if (!existsSync(join(root, dir, 'scripts'))) {
    errors.push(`${dir}: scripts/ 없음 (moi 규칙: 모든 스킬은 스크립트 필수)`);
  }

  const text = readFileSync(skillMd, 'utf8');
  const lines = text.split('\n');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) {
    errors.push(`${dir}: YAML 프런트매터 없음`);
    continue;
  }
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].trim();
  }

  const name = fm.name ?? '';
  if (!name) {
    errors.push(`${dir}: name 누락`);
  } else {
    if (name !== dir) errors.push(`${dir}: name('${name}')이 디렉터리명과 불일치 (표준: 일치해야 함)`);
    if (!NAME_RE.test(name) || name.length > 64) errors.push(`${dir}: name 형식 위반 (소문자 kebab-case, 64자 이하)`);
  }

  const desc = fm.description ?? '';
  if (!desc) errors.push(`${dir}: description 누락`);
  else if (desc.length > 1024) errors.push(`${dir}: description ${desc.length}자 (1024자 초과)`);

  const compat = fm.compatibility ?? '';
  if (compat.length > 500) errors.push(`${dir}: compatibility ${compat.length}자 (500자 초과)`);

  if (lines.length > 500) warnings.push(`${dir}: SKILL.md ${lines.length}줄 (500줄 이하 권장)`);

  const scriptsDir = join(root, dir, 'scripts');
  if (existsSync(scriptsDir) && readdirSync(scriptsDir).length === 0) {
    errors.push(`${dir}: scripts/ 비어 있음`);
  }
}

// AGENTS.md 스킬 인덱스 대조 (moi 규칙: 새 스킬은 AGENTS.md 스킬 인덱스에 등록)
const agentsMd = resolve(root, '..', '..', 'AGENTS.md');
if (existsSync(agentsMd)) {
  const md = readFileSync(agentsMd, 'utf8');
  const indexed = new Set();
  for (const line of md.split('\n')) {
    const m = /^\|\s*`([a-z0-9][a-z0-9-]*)`\s*\|/.exec(line);
    if (m) indexed.add(m[1]);
  }
  for (const dir of entries) {
    if (!indexed.has(dir)) errors.push(`${dir}: AGENTS.md 스킬 인덱스에 미등록`);
  }
  for (const id of indexed) {
    if (!entries.includes(id)) errors.push(`AGENTS.md 스킬 인덱스 '${id}': 대응 스킬 디렉터리 없음`);
  }
} else {
  warnings.push(`AGENTS.md 없음(${agentsMd}) — 스킬 인덱스 대조 생략`);
}

for (const w of warnings) console.log(`WARN ${w}`);
if (errors.length) {
  console.log(`FAIL: 스킬 표준 위반 ${errors.length}건`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log(`OK: 스킬 ${entries.length}개 표준 점검 통과 (name/description/scripts/인덱스)`);
