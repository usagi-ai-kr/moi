#!/usr/bin/env node
// #168 Pele PoC 번들 분석 (임시 PoC, 커밋 대상 아님)
// 1단계와 동일: gzip level 9 / brotli quality 11, 실제 브라우저 로드 델타 기준
// 사용: node scripts/pele-poc/bundle-analyze.mjs --assets <dir> --render <render-aggregate.json> --out <out>
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const assetsDir = opt('assets', '/private/var/folders/6f/b2z9tlm92811sfkbvb3__76c0000gn/T/opencode/moi-work/pele-poc/build/assets');
const renderPath = opt('render', '/private/var/folders/6f/b2z9tlm92811sfkbvb3__76c0000gn/T/opencode/moi-work/pele-poc/render-aggregate.json');
const outPath = opt('out', '/private/var/folders/6f/b2z9tlm92811sfkbvb3__76c0000gn/T/opencode/moi-work/pele-poc/bundle-report.json');

const render = JSON.parse(readFileSync(renderPath, 'utf8'));
const files = readdirSync(assetsDir);
const cache = new Map();
function sizes(f) {
  if (cache.has(f)) return cache.get(f);
  const buf = readFileSync(join(assetsDir, f));
  const out = {
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
  cache.set(f, out);
  return out;
}
const KiB = (n) => Math.round((n / 1024) * 10) / 10;
function sum(list) {
  const uniq = [...new Set(list)];
  const rows = uniq.map((f) => ({ file: f, ...sizes(f) }));
  return {
    count: rows.length,
    raw: rows.reduce((a, r) => a + r.raw, 0),
    gzip: rows.reduce((a, r) => a + r.gzip, 0),
    brotli: rows.reduce((a, r) => a + r.brotli, 0),
    rows: rows.sort((a, b) => b.raw - a.raw),
  };
}
const withKiB = (s) => ({ ...s, rawKiB: KiB(s.raw), gzipKiB: KiB(s.gzip), brotliKiB: KiB(s.brotli) });

const report = {};
for (const [variant, data] of Object.entries(render)) {
  const s = data.summary;
  const entry = s.entryChunks;
  const flow = s.firstByType?.flowchart?.chunks ?? [];
  const seq = s.firstByType?.sequenceDiagram?.chunks ?? [];
  const all = data.runs.at(-1).results.flatMap((r) => r.chunks);
  report[variant] = {
    entry: withKiB(sum(entry)),
    firstFlowchart: withKiB(sum(flow)),
    firstSequence: withKiB(sum(seq)),
    firstSvgFlowchart: withKiB(sum([...entry, ...flow])),
    firstSvgSequence: withKiB(sum([...entry, ...seq])),
    allLoadedDuringRun: withKiB(sum([...entry, ...all])),
    firstFlowchartId: s.firstByType?.flowchart?.questionId ?? null,
    firstSequenceId: s.firstByType?.sequenceDiagram?.questionId ?? null,
  };
  console.log(`# ${variant}`);
  console.log(`  entry          ${report[variant].entry.count} chunks  ${report[variant].entry.rawKiB}/${report[variant].entry.gzipKiB}/${report[variant].entry.brotliKiB} KiB`);
  console.log(`  +flowchart     ${report[variant].firstFlowchart.count} chunks  ${report[variant].firstFlowchart.rawKiB}/${report[variant].firstFlowchart.gzipKiB}/${report[variant].firstFlowchart.brotliKiB} KiB`);
  console.log(`  +sequence      ${report[variant].firstSequence.count} chunks  ${report[variant].firstSequence.rawKiB}/${report[variant].firstSequence.gzipKiB}/${report[variant].firstSequence.brotliKiB} KiB`);
  console.log(`  첫 SVG 누적(flow)  ${report[variant].firstSvgFlowchart.count} chunks  ${report[variant].firstSvgFlowchart.rawKiB}/${report[variant].firstSvgFlowchart.gzipKiB}/${report[variant].firstSvgFlowchart.brotliKiB} KiB`);
  console.log(`  첫 SVG 누적(seq)   ${report[variant].firstSvgSequence.count} chunks  ${report[variant].firstSvgSequence.rawKiB}/${report[variant].firstSvgSequence.gzipKiB}/${report[variant].firstSvgSequence.brotliKiB} KiB`);
  console.log(`  런 전체 로드    ${report[variant].allLoadedDuringRun.count} chunks  ${report[variant].allLoadedDuringRun.rawKiB}/${report[variant].allLoadedDuringRun.gzipKiB}/${report[variant].allLoadedDuringRun.brotliKiB} KiB`);
}

writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log('→', outPath);
