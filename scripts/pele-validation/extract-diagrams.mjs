#!/usr/bin/env node
// #179 독립 검증 — content/questions에서 실제 해설 mermaid 도식 전수 추출.
// content는 읽기만 한다(소스 수정 금지). 산출물은 harness 입력용 JSON 1개.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const here = import.meta.dirname;
const repoRoot = resolve(here, '../..');
const contentDir = join(repoRoot, 'content/questions');

const TYPE_KEYWORDS = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'requirementDiagram',
  'C4Context',
  'zenuml',
];

/** 코드 첫 토큰에서 도식 타입을 추정한다(해설 원문 기준 라벨). */
export function guessDiagramType(code) {
  const first = code.trim().split('\n')[0]?.trim() ?? '';
  const token = first.split(/\s+/)[0] ?? '';
  return TYPE_KEYWORDS.find((k) => token === k || token.startsWith(`${k} `) || token.startsWith(`${k}-`)) ?? 'unknown';
}

const files = readdirSync(contentDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(join(contentDir, d.name)).map((f) => join(d.name, f)))
  .filter((f) => f.endsWith('.json'))
  .sort();

const questions = [];
let total = 0;

for (const rel of files) {
  const abs = join(contentDir, rel);
  const data = JSON.parse(readFileSync(abs, 'utf8'));
  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    const explanation = typeof item.explanation === 'string' ? item.explanation : '';
    const blocks = [];
    const re = /```mermaid\n([\s\S]*?)```/g;
    let m;
    let index = 0;
    while ((m = re.exec(explanation)) !== null) {
      const code = m[1].replace(/\n$/, '');
      blocks.push({
        blockIndex: index,
        diagramType: guessDiagramType(code),
        code,
      });
      index += 1;
    }
    if (blocks.length === 0) continue;
    questions.push({
      sourceFile: `content/questions/${rel}`,
      questionId: item.questionId,
      explanation,
      diagrams: blocks,
    });
    total += blocks.length;
  }
}

const dataset = { generatedFrom: 'content/questions', total, questions };

const outArg = process.argv.indexOf('--out');
const outPath = outArg >= 0 ? process.argv[outArg + 1] : join(here, 'harness/dataset.json');
mkdirSync(resolve(outPath, '..'), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(dataset, null, 2)}\n`);

const byType = {};
for (const q of dataset.questions) {
  for (const d of q.diagrams) byType[d.diagramType] = (byType[d.diagramType] ?? 0) + 1;
}
console.log(
  `추출 ${total}개 도식 / ${dataset.questions.length}개 문항 → ${outPath}\n  타입별 ${JSON.stringify(byType)}`,
);
