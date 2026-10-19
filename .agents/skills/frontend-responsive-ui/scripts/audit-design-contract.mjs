#!/usr/bin/env node
// DESIGN.md 계약의 문서 누락 검출. 실제 시각/접근성 검증을 대체하지 않는다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const design = readFileSync(resolve(root, 'DESIGN.md'), 'utf8');
const skill = readFileSync(resolve(root, '.agents/skills/frontend-responsive-ui/SKILL.md'), 'utf8');
const rules = [
  ['전환 스택', /shadcn\/ui[\s\S]*Tailwind/],
  ['GitHub 아이콘', /GitHub Primer/],
  ['UUID 비노출', /UUID/],
  ['페이지네이션', /페이지네이션/],
  ['로딩 및 실패', /Skeleton[\s\S]*error/],
  ['화면 검증', /before\/after/],
  ['모바일 해상도', /320[\s\S]*375[\s\S]*768[\s\S]*1024[\s\S]*1280/],
];
const missing = rules.filter(([name, regex]) => !regex.test(design)).map(([name]) => name);
const cases = ['GitHub Primer', 'Khan Academy', 'Anki', 'shadcn/ui'];
if (cases.filter(name => design.includes('**' + name + '**')).length < 3) missing.push('벤치마크 3개');
if (!skill.includes('DESIGN.md') || !skill.includes('audit-design-contract.mjs')) missing.push('스킬 연결');
if (missing.length) { console.error('DESIGN 계약 누락: ' + missing.join(', ')); process.exit(1); }
console.log('DESIGN 계약 문서 OK: ' + rules.length + '개 항목, 벤치마크 3개 이상, 스킬 연결');
