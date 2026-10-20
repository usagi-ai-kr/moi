#!/usr/bin/env node
// #168 Pele PoC 보안 매트릭스 (임시 PoC, 커밋 대상 아님)
// 합성 악성 샘플을 Mermaid(strict) / Pele 양쪽에 넣어 출력 SVG를 정적 토큰 + 살아있는 DOM으로 검사한다.
// 사용: node scripts/pele-poc/security.mjs --out <outDir>
import { readFileSync, writeFileSync } from 'node:fs';
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
await page.goto(`${base}/?mode=sec&variant=both`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__pocDone === true, null, { timeout: 60000 });
const raw = await page.evaluate(() => window.__pocResult);
const result = { ...raw, results: raw.results.map((r) => ({ ...r, mermaid: { ...r.mermaid, fullSvg: undefined }, pele: { ...r.pele, fullSvg: undefined } })) };
await browser.close();

const rows = result.results.map((r) => ({
  id: r.id,
  category: r.category,
  mermaid: {
    rendered: r.mermaid.rendered,
    error: r.mermaid.error ? String(r.mermaid.error).split('\n')[0] : null,
    attrTokens: r.mermaid.attrTokens ?? [],
    textTokens: r.mermaid.textTokens ?? [],
    urls: r.mermaid.urls ?? [],
    elements: r.mermaid.elements ?? {},
    live: r.mermaid.live,
  },
  pele: {
    rendered: r.pele.rendered,
    error: r.pele.error ? String(r.pele.error).split('\n')[0] : null,
    attrTokens: r.pele.attrTokens ?? [],
    textTokens: r.pele.textTokens ?? [],
    urls: r.pele.urls ?? [],
    elements: r.pele.elements ?? {},
    live: r.pele.live,
  },
}));

const risky = rows.filter(
  (r) =>
    r.mermaid.live.xssFired ||
    r.pele.live.xssFired ||
    r.mermaid.live.scripts > 0 ||
    r.pele.live.scripts > 0 ||
    r.mermaid.live.handlers > 0 ||
    r.pele.live.handlers > 0 ||
    r.mermaid.attrTokens.length > 0 ||
    r.pele.attrTokens.length > 0,
);

writeFileSync(join(outDir, 'security.json'), `${JSON.stringify({ rows, risky, consoleErrors: [...new Set(consoleErrors)] }, null, 2)}\n`);

console.log('# 보안 매트릭스 (Mermaid 12.2.0 strict vs Pele 1.7.0)');
console.log('id'.padEnd(26), 'mermaid'.padEnd(54), 'pele');
for (const r of rows) {
  const fmt = (x) =>
    x.rendered
      ? `속성위험=[${x.attrTokens.join(',')}] 텍스트위험=[${x.textTokens.join(',')}] url=[${x.urls.join(',')}] el=${JSON.stringify(x.elements)} live=${JSON.stringify(x.live)}`
      : `렌더실패(${x.error})`;
  console.log(r.id.padEnd(26), fmt(r.mermaid).padEnd(54), fmt(r.pele));
}
console.log('속성 기반 위험 신호:', risky.length ? risky.map((r) => r.id).join(', ') : '없음');
console.log('→', join(outDir, 'security.json'));
