#!/usr/bin/env node
// #168 Pele PoC 의미 대조 (임시 PoC, 커밋 대상 아님)
// Mermaid SVG와 Pele SVG에서 추출한 텍스트 라벨 집합을 비교해 "의미 누락"을 객관적으로 감지한다.
// 사용: node scripts/pele-poc/compare.mjs --out <outDir> [--base mermaid] [--target pele]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const outDir = opt('out', '/private/var/folders/6f/b2z9tlm92811sfkbvb3__76c0000gn/T/opencode/moi-work/pele-poc');
const base = opt('base', 'mermaid');
const target = opt('target', 'pele');
const inventoryPath = opt('inventory', '/private/var/folders/6f/b2z9tlm92811sfkbvb3__76c0000gn/T/opencode/moi-work/mermaid-baseline/inventory.json');

const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const diagrams = inventory.diagrams;
const baseLabels = JSON.parse(readFileSync(join(outDir, `labels-${base}.json`), 'utf8'));
const targetLabels = JSON.parse(readFileSync(join(outDir, `labels-${target}.json`), 'utf8'));

const key = (d) => `${d.questionId}:${d.blockIndex}`;
const norm = (s) => (s ?? '').replace(/\s+/g, '').replace(/^["'“”]+|["'“”]+$/g, '');

const rows = [];
for (const d of diagrams) {
  const k = key(d);
  const b = baseLabels[k];
  const t = targetLabels[k];
  if (!b || !t) {
    rows.push({ id: k, diagramType: d.diagramType, status: !b ? `${base}-없음` : `${target}-없음` });
    continue;
  }
  const bAll = new Set(b.allText.map(norm));
  const tAll = new Set(t.allText.map(norm));
  const missing = [...bAll].filter((x) => !tAll.has(x));
  const extra = [...tAll].filter((x) => !bAll.has(x));
  const bNode = new Set(b.nodeLabels.map(norm));
  const tNode = new Set(t.nodeLabels.map(norm));
  const missingNode = [...bNode].filter((x) => !tNode.has(x));
  const bEdge = new Set(b.edgeLabels.map(norm));
  const tEdge = new Set(t.edgeLabels.map(norm));
  const missingEdge = [...bEdge].filter((x) => !tEdge.has(x));
  const bCluster = new Set(b.clusterLabels.map(norm));
  const tCluster = new Set(t.clusterLabels.map(norm));
  const missingCluster = [...bCluster].filter((x) => !tCluster.has(x));

  rows.push({
    id: k,
    diagramType: d.diagramType,
    status: 'ok',
    textCount: { base: bAll.size, target: tAll.size },
    nodeLabels: { base: bNode.size, target: tNode.size, missing: missingNode },
    edgeLabels: { base: bEdge.size, target: tEdge.size, missing: missingEdge },
    clusterLabels: { base: bCluster.size, target: tCluster.size, missing: missingCluster },
    nodeLabelRaw: { base: b.nodeLabelCount ?? null, target: t.nodeLabelCount ?? null },
    edgeLabelRaw: { base: b.edgeLabelCount ?? null, target: t.edgeLabelCount ?? null },
    clusterLabelRaw: { base: b.clusterLabelCount ?? null, target: t.clusterLabelCount ?? null },
    missingAll: missing,
    extraAll: extra,
    nodes: { base: b.nodeCount, target: t.nodeCount },
    edges: { base: b.edgeCount, target: t.edgeCount },
    foreignObject: { base: b.foreignObjectCount, target: t.foreignObjectCount },
    a11y: { base: `${b.role}|${b.ariaRoleDescription}|title=${b.hasTitle}`, target: `${t.role}|${t.ariaRoleDescription}|title=${t.hasTitle}` },
  });
}

const okRows = rows.filter((r) => r.status === 'ok');
const summary = {
  base,
  target,
  compared: okRows.length,
  missingTextBlocks: okRows.filter((r) => r.missingAll.length > 0).length,
  extraTextBlocks: okRows.filter((r) => r.extraAll.length > 0).length,
  missingNodeLabelBlocks: okRows.filter((r) => r.nodeLabels.missing.length > 0).length,
  missingEdgeLabelBlocks: okRows.filter((r) => r.edgeLabels.missing.length > 0).length,
  missingClusterLabelBlocks: okRows.filter((r) => r.clusterLabels.missing.length > 0).length,
  nodeRawDiffBlocks: okRows.filter((r) => r.nodeLabelRaw.base !== r.nodeLabelRaw.target).length,
  edgeRawDiffBlocks: okRows.filter((r) => r.edgeLabelRaw.base !== r.edgeLabelRaw.target).length,
  clusterRawDiffBlocks: okRows.filter((r) => r.clusterLabelRaw.base !== r.clusterLabelRaw.target).length,
  nodeCountDiffBlocks: okRows.filter((r) => r.nodes.base !== r.nodes.target).length,
  edgeCountDiffBlocks: okRows.filter((r) => r.edges.base !== r.edges.target).length,
  foreignObjectBlocks: okRows.filter((r) => r.foreignObject.base > 0).length,
};

const details = okRows
  .filter(
    (r) =>
      r.missingAll.length > 0 ||
      r.extraAll.length > 0 ||
      r.nodeLabels.missing.length > 0 ||
      r.edgeLabels.missing.length > 0 ||
      r.clusterLabels.missing.length > 0 ||
      r.nodeLabelRaw.base !== r.nodeLabelRaw.target ||
      r.edgeLabelRaw.base !== r.edgeLabelRaw.target ||
      r.clusterLabelRaw.base !== r.clusterLabelRaw.target ||
      r.nodes.base !== r.nodes.target ||
      r.edges.base !== r.edges.target,
  )
  .map((r) => ({
    id: r.id,
    diagramType: r.diagramType,
    missingAll: r.missingAll,
    extraAll: r.extraAll,
    nodeLabels: r.nodeLabels,
    edgeLabels: r.edgeLabels,
    clusterLabels: r.clusterLabels,
    nodeLabelRaw: r.nodeLabelRaw,
    edgeLabelRaw: r.edgeLabelRaw,
    clusterLabelRaw: r.clusterLabelRaw,
    nodes: r.nodes,
    edges: r.edges,
  }));

writeFileSync(join(outDir, `semantic-diff-${base}-vs-${target}.json`), `${JSON.stringify({ summary, details, rows }, null, 2)}\n`);
console.log('# 의미 대조', base, 'vs', target);
console.log(JSON.stringify(summary, null, 2));
console.log('차이 상세:', details.length, '건');
for (const d of details.slice(0, 40)) {
  console.log(
    `  ${d.id} (${d.diagramType}) 텍스트누락=${JSON.stringify(d.missingAll.slice(0, 4))} 노드raw=${d.nodeLabelRaw.base}->${d.nodeLabelRaw.target} 엣지raw=${d.edgeLabelRaw.base}->${d.edgeLabelRaw.target} 클러스터raw=${d.clusterLabelRaw.base}->${d.clusterLabelRaw.target} 노드수=${d.nodes.base}->${d.nodes.target} 엣지수=${d.edges.base}->${d.edges.target}`,
  );
}
