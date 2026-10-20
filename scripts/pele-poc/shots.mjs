#!/usr/bin/env node
// #168 Pele PoC 스크린샷 (Mermaid/Pele PNG 쌍) (임시 PoC, 커밋 대상 아님)
// 사용: node scripts/pele-poc/shots.mjs --out <outDir> [--viewport 1280] [--narrow 375]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const repoRequire = createRequire(join(import.meta.dirname, '../../package.json'));
const { chromium } = repoRequire('playwright');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const outDir = opt('out', '/private/var/folders/6f/b2z9tlm92811sfkbvb3__76c0000gn/T/opencode/moi-work/pele-poc');
const base = opt('base', 'http://localhost:4176');
const inventoryPath = opt('inventory', '/private/var/folders/6f/b2z9tlm92811sfkbvb3__76c0000gn/T/opencode/moi-work/mermaid-baseline/inventory.json');
const viewport = Number(opt('viewport', '1280'));
const narrow = Number(opt('narrow', '375'));

// 유형별 대표 + 의미 누락 의심 블록 (1단계 보고서 5장 P0/P1/P2)
const TARGETS = [
  'saa-perf-0005', // P0 대표 flowchart (subgraph)
  'saa-perf-0100', // P0 대표 sequenceDiagram
  'saa-res-0129', // P0 Mermaid 파싱 실패 1건
  'saa-perf-0006', // P0 subgraph + 고립 노드(간선 0)
  'saa-perf-0007', // P0 subgraph + 고립 노드(간선 0)
  'saa-perf-0045', // P0 subgraph + 경계 간선
  'saa-cost-0001', // P1 점선 + 간선 라벨
  'saa-sec-0067', // P1 sequence 3 participant
  'saa-sec-0114', // P1 sequence
  'saa-res-0077', // P1 sequence note
  'saa-res-0096', // P1 sequence note
  'saa-sec-0002', // P1 간선 라벨 4개
  'saa-sec-0004', // P1 간선 라벨 4개
  'saa-perf-0084', // P1/P2 긴 라벨 23자
  'saa-sec-0077', // P2 긴 라벨 25자
  'saa-sec-0014', // P2 긴 라벨 22자
  'saa-perf-0044', // P2 최대 밀도 6노드/7간선
  'saa-cost-0005', // P2 밀도 5노드/6간선
  'saa-cost-0007', // P2 밀도 5노드/6간선
];
const NARROW_TARGETS = ['saa-perf-0005', 'saa-perf-0100', 'saa-perf-0044'];

const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const blocks = inventory.diagrams.map((d) => ({
  questionId: d.questionId,
  blockIndex: d.blockIndex,
  diagramType: d.diagramType,
  code: d.code,
}));
const indexOf = new Map(blocks.map((b, i) => [b.questionId, i]));

const pngDir = join(outDir, 'png');
mkdirSync(pngDir, { recursive: true });

const browser = await chromium.launch();
const results = [];

async function capture(id, vp, prefix) {
  const idx = indexOf.get(id);
  if (idx === undefined) {
    console.log(`  ${id}: 인벤토리에 없음`);
    return;
  }
  const page = await browser.newPage({ viewport: { width: vp, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript((b) => {
    window.__pocBlocks = b;
  }, blocks);
  await page.goto(`${base}/?mode=shot&variant=both&block=${idx}&width=${vp}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pocDone === true, null, { timeout: 60000 });
  const info = await page.evaluate(() => window.__pocResult);
  const files = {};
  for (const lib of ['mermaid', 'pele']) {
    const el = page.locator(`#shot-${lib}`);
    const file = join(pngDir, `${prefix}${id}-${lib}.png`);
    await el.screenshot({ path: file });
    files[lib] = file;
  }
  results.push({ id, viewport: vp, ...info, files });
  console.log(
    `  ${prefix}${id} (${vp}px): mermaid ok=${info.mermaid.ok} ${info.mermaid.bytes}B / pele ok=${info.pele.ok} ${info.pele.bytes}B`,
  );
  if (!info.mermaid.ok) console.log(`    mermaid 오류: ${String(info.mermaid.error).split('\n')[0]}`);
  if (!info.pele.ok) console.log(`    pele 오류: ${String(info.pele.error).split('\n')[0]}`);
  await page.close();
}

console.log(`# PNG 쌍 생성 (${viewport}px)`);
for (const id of TARGETS) await capture(id, viewport, '');
console.log(`# PNG 쌍 생성 (좁은 화면 ${narrow}px)`);
for (const id of NARROW_TARGETS) await capture(id, narrow, 'narrow-');

await browser.close();
writeFileSync(join(outDir, 'shots.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log('→', join(pngDir));
