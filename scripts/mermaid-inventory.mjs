#!/usr/bin/env node
// #168 1단계: 문제은행 JSON의 해설 Mermaid 블록 전수 인벤토리 (읽기 전용).
// 사용: node scripts/mermaid-inventory.mjs [--root <dir>] [--out <file>]
// 출력: JSON(기본 stdout, --out 지정 시 파일) + 사람용 요약(stderr).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

function argValue(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const root = resolve(argValue('--root', join(HERE, '..')));
const outFile = argValue('--out', null);

function walkJson(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkJson(p, out);
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

const HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/;
const SPECIAL = [
  ['subgraph', /\bsubgraph\b/],
  ['classDef', /\bclassDef\b/],
  ['class', /^\s*class\s+\S+/m],
  ['style', /^\s*style\s+\S+/m],
  ['linkStyle', /\blinkStyle\b/],
  ['click', /^\s*click\s+\S+/m],
  ['initDirective', /%%\{\s*init\b/],
  ['htmlTag', /<\/?[a-zA-Z][^>\n]*>/],
  ['link', /\bhref\b|\bclick\s+\S+\s+(?:href|call|"https?:)|!?\[[^\]]*\]\([^)]*\)/],
  ['accTitle', /^\s*accTitle\s*:/m],
  ['accDescr', /^\s*accDescr\b/m],
];

function labelTexts(code) {
  const labels = [];
  for (const line of code.split('\n')) {
    const seq = line.match(/^\s*(?:participant|actor)\s+\S+\s+as\s+(.+)$/);
    if (seq) {
      labels.push(seq[1].replace(/^"|"$/g, '').trim());
      continue;
    }
    const message = line.match(/^\s*\S+\s*(?:-->>|->>|-->|->|--x|-x|--\)|-\))\s*\S*\s*:\s*(.+)$/);
    if (message) {
      labels.push(message[1].trim());
      continue;
    }
    if (/^\s*(%%|subgraph\b|end\b|classDef\b|class\b|style\b|linkStyle\b|click\b|flowchart\b|graph\b|sequenceDiagram\b|participant\b|actor\b|note\b|loop\b|alt\b|else\b|opt\b|activate\b|deactivate\b|autonumber\b)/.test(line)) {
      const quoted = line.match(/"([^"]+)"/g);
      if (quoted) labels.push(...quoted.map((s) => s.slice(1, -1)));
      continue;
    }
    for (const m of line.matchAll(/\[([^\]]*)\]|\{([^}]*)\}|\(([^)]*)\)|\|([^|]*)\|/g)) {
      const text = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').replace(/<br\s*\/?>/gi, ' ').trim();
      if (text && !/^[-.>]+$/.test(text)) labels.push(text);
    }
  }
  return labels;
}

function parseBlocks(markdown) {
  const blocks = [];
  const re = /^[ \t]*```mermaid[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
  for (const m of markdown.matchAll(re)) {
    blocks.push({ code: m[1].replace(/\r\n/g, '\n').replace(/\s+$/, ''), index: m.index ?? 0 });
  }
  return blocks;
}

const packs = [];
const diagrams = [];
const issues = [];

for (const file of walkJson(join(root, 'content/questions'))) {
  let pack;
  try {
    pack = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    issues.push(`JSON 파싱 실패: ${relative(root, file)} — ${error.message}`);
    continue;
  }
  if (!Array.isArray(pack.items)) continue;
  packs.push({ file: relative(root, file), packId: pack.packId, examCode: pack.examCode, items: pack.items.length });

  for (const item of pack.items) {
    const explanation = typeof item.explanation === 'string' ? item.explanation : '';
    const blocks = parseBlocks(explanation);
    const fenceCount = (explanation.match(/^[ \t]*```mermaid\b/gm) ?? []).length;
    if (fenceCount !== blocks.length) {
      issues.push(`닫히지 않은 Mermaid 펜스 의심: ${pack.packId}/${item.questionId} (펜스 ${fenceCount}, 파싱 ${blocks.length})`);
    }
    blocks.forEach((block, i) => {
      const lines = block.code.split('\n');
      const first = lines.find((l) => l.trim())?.trim() ?? '';
      const [type, direction] = first.split(/\s+/);
      const labels = labelTexts(block.code);
      const koreanLabels = labels.filter((l) => HANGUL.test(l));
      const special = SPECIAL.filter(([, re]) => re.test(block.code)).map(([name]) => name);
      const sequence = type === 'sequenceDiagram';
      const edgeCount = (block.code.match(/-->>|->>|-->|->|--x|-x|--\)|-\)|==>|-.->|--/g) ?? []).length;
      const edgeLabelCount = (block.code.match(/\|[^|\n]+\|/g) ?? []).length;
      diagrams.push({
        questionId: item.questionId,
        packId: pack.packId,
        examCode: pack.examCode,
        domainCode: item.domainCode,
        blockIndex: i + 1,
        diagramType: type || 'unknown',
        direction: direction && /^(TB|TD|BT|LR|RL)$/.test(direction) ? direction : null,
        lineCount: lines.length,
        charCount: block.code.length,
        hasKoreanLabel: HANGUL.test(block.code),
        koreanLabelCount: koreanLabels.length,
        longestLabelChars: labels.reduce((max, l) => Math.max(max, l.length), 0),
        specialSyntax: special,
        nodeShapeCount: sequence ? (block.code.match(/^\s*(?:participant|actor)\s+/gm) ?? []).length : (block.code.match(/\[[^\]\n]*\]|\{[^}\n]*\}|\([^)\n]*\)/g) ?? []).length,
        edgeCount,
        edgeLabelCount,
        hasDottedEdge: /-\.->|-\.-/.test(block.code),
        hasNote: /^\s*note\b/im.test(block.code),
        hasLoop: /^\s*(?:loop|alt|opt|par|critical)\b/im.test(block.code),
        labels: labels.slice(0, 12),
        code: block.code,
      });
    });
  }
}

const byType = {};
const byDomain = {};
const bySpecial = {};
const byPack = {};
for (const d of diagrams) {
  byType[d.diagramType] = (byType[d.diagramType] ?? 0) + 1;
  byDomain[d.domainCode] = (byDomain[d.domainCode] ?? 0) + 1;
  byPack[d.packId] = (byPack[d.packId] ?? 0) + 1;
  for (const s of d.specialSyntax) bySpecial[s] = (bySpecial[s] ?? 0) + 1;
}

const lineCounts = diagrams.map((d) => d.lineCount).sort((a, b) => a - b);
const questionIds = new Set(diagrams.map((d) => d.questionId));
const summary = {
  sourceRoot: relative(root, join(root, 'content/questions')),
  packs: packs.length,
  questions: packs.reduce((n, p) => n + p.items, 0),
  questionsWithDiagrams: questionIds.size,
  diagrams: diagrams.length,
  byType,
  byDomain,
  byPack,
  specialSyntax: bySpecial,
  koreanLabelDiagrams: diagrams.filter((d) => d.hasKoreanLabel).length,
  lineCount: {
    min: lineCounts[0] ?? 0,
    max: lineCounts.at(-1) ?? 0,
    median: lineCounts.length ? lineCounts[Math.floor(lineCounts.length / 2)] : 0,
    total: lineCounts.reduce((a, b) => a + b, 0),
  },
  maxLongestLabelChars: diagrams.reduce((m, d) => Math.max(m, d.longestLabelChars), 0),
  issues,
};

const result = { summary, packs, diagrams };
const json = `${JSON.stringify(result, null, 2)}\n`;
if (outFile) writeFileSync(resolve(outFile), json);
else process.stdout.write(json);

const fmt = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ');
console.error(`# Mermaid 인벤토리 — 팩 ${summary.packs}, 문항 ${summary.questions}, 도식 문항 ${summary.questionsWithDiagrams}, 도식 ${summary.diagrams}`);
console.error(`유형: ${fmt(byType)}`);
console.error(`도메인: ${fmt(byDomain)}`);
console.error(`특수 문법: ${fmt(bySpecial) || '없음'}`);
console.error(`한글 라벨: ${summary.koreanLabelDiagrams}/${summary.diagrams}, 줄 수 min/median/max=${summary.lineCount.min}/${summary.lineCount.median}/${summary.lineCount.max}`);
console.error(`이슈: ${issues.length ? issues.join(' | ') : '없음'}`);
