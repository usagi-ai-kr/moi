#!/usr/bin/env node
// #168 Pele PoC 측정 드라이버 (임시 PoC, 커밋 대상 아님)
// 1단계(#168-mermaid-inventory) 프로토콜과 동일: fresh Chromium → entry import → 71 cold → 71 warm
// 사용: node scripts/pele-poc/measure.mjs --out <outDir> [--reps 3] [--variants a,b,c]
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

const outDir = opt('out', '/tmp/pele-poc');
const inventoryPath = opt('inventory', '/private/var/folders/6f/b2z9tlm92811sfkbvb3__76c0000gn/T/opencode/moi-work/mermaid-baseline/inventory.json');
const base = opt('base', 'http://localhost:4176');
const reps = Number(opt('reps', '3'));
const variants = opt('variants', 'mermaid,pele,pele-core,pele-lazy').split(',').filter(Boolean);
const width = Number(opt('width', '1280'));

const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const blocks = inventory.diagrams.map((d) => ({
  questionId: d.questionId,
  blockIndex: d.blockIndex,
  diagramType: d.diagramType,
  code: d.code,
}));

mkdirSync(outDir, { recursive: true });

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    n: values.length,
    min: round2(sorted[0] ?? 0),
    p50: round2(pick(0.5)),
    p95: round2(pick(0.95)),
    max: round2(sorted.at(-1) ?? 0),
    total: round2(values.reduce((a, b) => a + b, 0)),
  };
};
const round2 = (n) => Math.round(n * 100) / 100;
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const browser = await chromium.launch();
const all = {};

for (const variant of variants) {
  const runs = [];
  for (let rep = 0; rep < reps; rep++) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    await page.addInitScript((b) => {
      window.__pocBlocks = b;
    }, blocks);
    await page.goto(`${base}/?mode=measure&variant=${variant}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pocDone === true, null, { timeout: 120000 });
    const result = await page.evaluate(() => window.__pocResult);
    result.consoleErrors = [...new Set(consoleErrors)];
    runs.push(result);
    await page.close();
    process.stdout.write(`  ${variant} rep${rep + 1}: ok=${result.results.filter((r) => r.ok).length}/${blocks.length} entry=${result.entryMs}ms\n`);
  }

  const last = runs.at(-1);
  const okCount = last.results.filter((r) => r.ok).length;
  const failed = last.results
    .filter((r) => !r.ok)
    .map((r) => ({ questionId: r.questionId, blockIndex: r.blockIndex, diagramType: r.diagramType, error: r.error, errorDetail: r.errorDetail }));

  // 3회 반복 pooled 통계(총 3×71 샘플) + 회차별 p50
  const pooledCold = runs.flatMap((r) => r.results.map((x) => x.coldMs));
  const pooledWarm = runs.flatMap((r) => r.warm.map((w) => w.ms));
  const perRepColdP50 = runs.map((r) => {
    const s = [...r.results.map((x) => x.coldMs)].sort((a, b) => a - b);
    return round2(s[Math.floor(s.length / 2)]);
  });
  const perRepWarmP50 = runs.map((r) => {
    const s = [...r.warm.map((w) => w.ms)].sort((a, b) => a - b);
    return round2(s[Math.floor(s.length / 2)]);
  });

  const byType = {};
  for (const r of last.results) {
    byType[r.diagramType] ??= { total: 0, ok: 0, cold: [], warm: [] };
    byType[r.diagramType].total++;
    if (r.ok) byType[r.diagramType].ok++;
  }
  last.warm.forEach((w, i) => {
    const t = last.results[i].diagramType;
    byType[t].warm.push(w.ms);
  });
  last.results.forEach((r, i) => {
    byType[r.diagramType].cold.push(r.coldMs);
  });

  const summary = {
    variant,
    reps,
    blocks: blocks.length,
    ok: okCount,
    failed: blocks.length - okCount,
    entryMs: { perRun: runs.map((r) => r.entryMs), median: round2(median(runs.map((r) => r.entryMs))) },
    cold: stats(pooledCold),
    warm: stats(pooledWarm),
    coldP50PerRep: perRepColdP50,
    warmP50PerRep: perRepWarmP50,
    coldP50Median: round2(median(perRepColdP50)),
    warmP50Median: round2(median(perRepWarmP50)),
    byType: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [k, { total: v.total, ok: v.ok, cold: stats(v.cold), warm: stats(v.warm) }]),
    ),
    firstByType: last.firstByType,
    entryChunks: last.entryChunks.map((c) => c.file),
    failedBlocks: failed,
    consoleErrors: last.consoleErrors,
  };

  all[variant] = { summary, runs, labels: last.labels ?? null };
  writeFileSync(join(outDir, `render-${variant}.json`), `${JSON.stringify({ summary, runs }, null, 2)}\n`);
  writeFileSync(join(outDir, `labels-${variant}.json`), `${JSON.stringify(last.labels ?? {}, null, 2)}\n`);
  console.log(`# ${variant}: ${okCount}/${blocks.length} 성공, 실패 ${blocks.length - okCount}`);
  console.log(`  entry ${summary.entryMs.median}ms (${summary.entryChunks.length} chunks)`);
  console.log(`  cold pooled ${JSON.stringify(summary.cold)} (p50/회 ${perRepColdP50.join(', ')})`);
  console.log(`  warm pooled ${JSON.stringify(summary.warm)} (p50/회 ${perRepWarmP50.join(', ')})`);
}

await browser.close();
writeFileSync(join(outDir, 'render-aggregate.json'), `${JSON.stringify(all, null, 2)}\n`);
console.log('집계 →', join(outDir, 'render-aggregate.json'));
