#!/usr/bin/env node
// #179 Pele 독립 검증 실행기 (1개 명령 재현).
// ① 실제 앱 경로 71/71 도식 표시·폴백 ② 악성 샘플 차단·외부요청 0
// ③ 320/375/768/1024/1280 × light/dark 가로 오버플로 ④ 첫 SVG cold/warm p50 3회.
// 산출물 JSON은 파일 저장, 콘솔은 요약만 출력한다.
//
// 사용: node scripts/pele-validation/run-validation.mjs [--out <dir>] [--port 4195]
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { appPathSamples, sanitizeCases } from './attack-samples.mjs';

const repoRequire = createRequire(join(import.meta.dirname, '../../package.json'));
const { chromium } = repoRequire('playwright');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};

const repoRoot = resolve(import.meta.dirname, '../..');
const outDir = resolve(opt('out', join(repoRoot, 'docs/evidence/179-pele')));
const port = Number(opt('port', '4195'));
const base = `http://127.0.0.1:${port}`;
const buildDir = resolve(opt('build', join(tmpdir(), 'moi-pele-validation-build')));
const shotDir = join(outDir, 'screenshots');
const VIEWPORTS = [320, 375, 768, 1024, 1280];
const COLOR_SCHEMES = ['light', 'dark'];
const PERF_RUNS = 3;

mkdirSync(outDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });

const log = (...a) => console.log(...a);
const round2 = (n) => Math.round(n * 100) / 100;
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// ── 0. 데이터 준비 ────────────────────────────────────────────────────────────
const datasetPath = join(outDir, 'dataset.json');
if (!existsSync(datasetPath)) {
  await new Promise((res, rej) => {
    const p = spawn(
      process.execPath,
      [join(import.meta.dirname, 'extract-diagrams.mjs'), '--out', datasetPath],
      { cwd: repoRoot, stdio: 'inherit' },
    );
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`extract exit ${c}`))));
  });
}
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
const fullDataset = { ...dataset, attacks: appPathSamples, sanitizeCases };

// ── 1. 하네스 빌드 ────────────────────────────────────────────────────────────
log('▶ 하네스 빌드 …');
await new Promise((res, rej) => {
  const p = spawn(
    process.execPath,
    [
      join(repoRoot, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      join(import.meta.dirname, 'vite.harness.config.mjs'),
    ],
    { cwd: repoRoot, env: { ...process.env, PELE_VALIDATION_OUT: buildDir }, stdio: 'inherit' },
  );
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`vite build exit ${c}`))));
});

// ── 2. preview 서버 ───────────────────────────────────────────────────────────
log(`▶ preview 서버 ${base} …`);
const server = spawn(
  process.execPath,
  [
    join(repoRoot, 'node_modules/vite/bin/vite.js'),
    'preview',
    '--config',
    join(import.meta.dirname, 'vite.harness.config.mjs'),
    '--port',
    String(port),
    '--strictPort',
    '--host',
    '127.0.0.1',
  ],
  { cwd: repoRoot, env: { ...process.env, PELE_VALIDATION_OUT: buildDir }, stdio: 'ignore' },
);
const stopServer = () => {
  if (!server.killed) server.kill('SIGTERM');
};
process.on('exit', stopServer);

let serverReady = false;
for (let i = 0; i < 60 && !serverReady; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const res = await fetch(`${base}/index.html`);
    serverReady = res.ok;
  } catch {
    serverReady = false;
  }
}
if (!serverReady) {
  stopServer();
  throw new Error('preview 서버 기동 실패');
}

const browser = await chromium.launch();

/** 공통: 페이지 준비 + 요청/콘솔 수집 */
async function newPage(ctx, { viewport, colorScheme }) {
  const page = await ctx.newPage();
  const requests = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('request', (r) => requests.push({ url: r.url(), type: r.resourceType() }));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript((data) => {
    window.__PELE_DATASET__ = data;
    window.__pwned = 0;
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push({
        directive: e.effectiveDirective ?? e.violatedDirective ?? '',
        blockedURI: e.blockedURI ?? '',
        sample: e.sample ?? '',
      });
    });
  }, fullDataset);
  if (viewport) await page.setViewportSize(viewport);
  if (colorScheme) await page.emulateMedia({ colorScheme });
  return { page, requests, consoleErrors, pageErrors };
}

const isLocal = (url) => {
  try {
    const u = new URL(url);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.protocol === 'data:';
  } catch {
    return false;
  }
};

/** 다이어그램 DOM 측정 — 렌더 상태·내부 오버플로·텍스트 잘림·id 중복 */
const MEASURE = () => {
  const r2 = (n) => Math.round(n * 100) / 100;
  const boxes = Array.from(document.querySelectorAll('[data-testid="mermaid-diagram"]'));
  const items = boxes.map((box, i) => {
    const svg = box.querySelector('svg');
    const isFallback = !!box.querySelector('p[role="alert"]');
    const isLoading = !!box.querySelector('[role="status"]');
    let internalOverflowPx = 0;
    let textClipped = false;
    let viewBox = null;
    let svgRect = null;
    let containerRect = null;
    let textCount = 0;
    let maxTextLen = 0;
    let minFontPx = 0;
    let contrast = 0;
    let textFill = null;
    let containerBg = null;
    if (svg) {
      internalOverflowPx = Math.max(0, box.scrollWidth - box.clientWidth);
      const r = svg.getBoundingClientRect();
      const c = box.getBoundingClientRect();
      svgRect = { width: r2(r.width), height: r2(r.height) };
      containerRect = { width: r2(c.width), height: r2(c.height) };
      const vb = svg.viewBox?.baseVal;
      viewBox = vb && vb.width ? { x: vb.x, y: vb.y, width: vb.width, height: vb.height } : null;
      const texts = Array.from(svg.querySelectorAll('text'));
      textCount = texts.length;
      // 텍스트 잘림은 루트 SVG 좌표계가 아니라 렌더된 클라이언트 사각형으로 판정한다
      // (SVG 내부 <g transform> 때문에 getBBox()는 로컬 좌표계를 준다).
      const svgBox = svg.getBoundingClientRect();
      for (const t of texts) {
        const len = (t.textContent ?? '').trim().length;
        if (len > maxTextLen) maxTextLen = len;
        const r = t.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (
          r.left < svgBox.left - 0.5 ||
          r.right > svgBox.right + 0.5 ||
          r.top < svgBox.top - 0.5 ||
          r.bottom > svgBox.bottom + 0.5
        ) {
          textClipped = true;
        }
        const fs = Number.parseFloat(getComputedStyle(t).fontSize);
        if (Number.isFinite(fs) && (minFontPx === 0 || fs < minFontPx)) minFontPx = fs;
      }
      // 대비 — 도식 텍스트 실사용색 vs 컨테이너 배경 (테마 매핑 확인)
      const firstText = texts[0];
      if (firstText) {
        const fill = getComputedStyle(firstText).fill;
        const bg = getComputedStyle(box).backgroundColor;
        const lum = (c) => {
          const m = c.match(/[\d.]+/g);
          if (!m) return null;
          const [r, g, b] = m.map(Number);
          const f = (v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const l1 = lum(fill);
        const l2 = lum(bg);
        if (l1 !== null && l2 !== null) {
          contrast = r2((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
        }
        textFill = fill;
        containerBg = bg;
      }
    }
    return {
      index: i,
      rendered: !!svg,
      fallback: isFallback,
      loading: isLoading,
      internalOverflowPx: r2(internalOverflowPx),
      textClipped,
      textCount,
      maxTextLen,
      minFontPx: r2(minFontPx),
      contrast: r2(contrast),
      textFill,
      containerBg,
      viewBox,
      svgRect,
      containerRect,
      hasRoleImg: box.getAttribute('role') === 'img',
      hasAriaLabel: !!box.getAttribute('aria-label'),
      hasSvgTitle: !!svg?.querySelector('title'),
      hasSvgDesc: !!svg?.querySelector('desc'),
      fallbackSource: isFallback ? (box.querySelector('pre code')?.textContent ?? '') : null,
    };
  });
  const ids = [];
  for (const box of boxes) {
    for (const el of box.querySelectorAll('[id]')) ids.push(el.id);
  }
  const dupIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  const page = document.documentElement;
  return {
    count: boxes.length,
    items,
    duplicateIds: dupIds,
    pageOverflowPx: Math.max(0, page.scrollWidth - page.clientWidth),
    bodyOverflowPx: Math.max(0, document.body.scrollWidth - document.body.clientWidth),
    viewportWidth: page.clientWidth,
  };
};

/** 뷰포트 밖으로溢나는 요소(스크롤 컨테이너 내부 제외) */
const OVERFLOW_ELEMENTS = () => {
  const r2 = (n) => Math.round(n * 100) / 100;
  const limit = document.documentElement.clientWidth;
  const out = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= limit + 1 && r.left >= -1) continue;
    let p = el.parentElement;
    let clipped = false;
    while (p) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') {
        clipped = true;
        break;
      }
      p = p.parentElement;
    }
    if (clipped) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: el.className?.toString?.().slice(0, 80) ?? '',
      left: r2(r.left),
      right: r2(r.right),
    });
  }
  return out.slice(0, 20);
};

const results = {
  meta: {
    issue: '#179',
    ranAt: new Date().toISOString(),
    productSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    dirtySnapshotHash: execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((l) => l.trim().slice(3))
      .sort()
      .join('\n'),
    dirtyFileCount: execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean).length,
    repoRoot,
    harness: 'scripts/pele-validation/harness (Explanation → renderPeleDiagram → sanitizePeleSvg)',
    note: '제품 src는 읽기만. 하네스는 scripts/pele-validation/** 와 docs/evidence/179-pele/** 에만 생성.',
  },
  diagrams: null,
  attacks: null,
  sanitizeBoundary: null,
  viewports: null,
  perf: null,
};

// ── 3. ① 71개 도식 전수 (1280 · light) ───────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const { page, requests, consoleErrors, pageErrors } = await newPage(ctx, {
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
  });
  await page.goto(`${base}/index.html?mode=diagrams`, { waitUntil: 'load' });
  await page.waitForFunction(
    (n) => {
      const boxes = document.querySelectorAll('[data-testid="mermaid-diagram"]');
      if (boxes.length < n) return false;
      return document.querySelectorAll('[data-testid="mermaid-diagram"] [role="status"]').length === 0;
    },
    dataset.total,
    { timeout: 120000 },
  );
  const measured = await page.evaluate(MEASURE);
  const overflowEls = await page.evaluate(OVERFLOW_ELEMENTS);
  const flat = dataset.questions.flatMap((q) =>
    q.diagrams.map((d) => ({ ...d, questionId: q.questionId, sourceFile: q.sourceFile })),
  );
  const rows = flat.map((d, i) => {
    const m = measured.items[i] ?? {};
    return {
      index: i,
      questionId: d.questionId,
      sourceFile: d.sourceFile,
      blockIndex: d.blockIndex,
      diagramType: d.diagramType,
      rendered: m.rendered ?? false,
      fallback: m.fallback ?? false,
      loading: m.loading ?? false,
      internalOverflowPx: m.internalOverflowPx ?? 0,
      textClipped: m.textClipped ?? false,
      textCount: m.textCount ?? 0,
      maxTextLen: m.maxTextLen ?? 0,
      minFontPx: m.minFontPx ?? 0,
      contrast: m.contrast ?? 0,
      textFill: m.textFill ?? null,
      viewBox: m.viewBox ?? null,
      svgRect: m.svgRect ?? null,
      hasSvgTitle: m.hasSvgTitle ?? false,
      hasSvgDesc: m.hasSvgDesc ?? false,
      hasRoleImg: m.hasRoleImg ?? false,
      hasAriaLabel: m.hasAriaLabel ?? false,
      fallbackSourceMatches: m.fallbackSource === null ? null : m.fallbackSource.trim() === d.code.trim(),
    };
  });
  results.diagrams = {
    total: flat.length,
    rendered: rows.filter((r) => r.rendered).length,
    fallback: rows.filter((r) => r.fallback).length,
    loading: rows.filter((r) => r.loading).length,
    domCount: measured.count,
    pageOverflowPx: measured.pageOverflowPx,
    bodyOverflowPx: measured.bodyOverflowPx,
    overflowElements: overflowEls,
    duplicateIds: measured.duplicateIds,
    internalOverflowCount: rows.filter((r) => r.internalOverflowPx > 1).length,
    textClippedCount: rows.filter((r) => r.textClipped).length,
    byType: Object.fromEntries(
      Object.entries(
        rows.reduce((acc, r) => {
          acc[r.diagramType] ??= { total: 0, rendered: 0, fallback: 0 };
          acc[r.diagramType].total += 1;
          if (r.rendered) acc[r.diagramType].rendered += 1;
          if (r.fallback) acc[r.diagramType].fallback += 1;
          return acc;
        }, {}),
      ),
    ),
    failures: rows.filter((r) => !r.rendered).map((r) => ({ index: r.index, questionId: r.questionId, diagramType: r.diagramType, fallback: r.fallback, reason: r.fallback ? 'sanitizer/render 거부 → 폴백' : '미렌더(로딩 잔류)' })),
    rows,
    externalRequests: requests.filter((r) => !isLocal(r.url)),
    consoleErrors,
    pageErrors,
  };
  await ctx.close();
}

// ── 4. ② 악성 샘플 (앱 경로) ─────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const { page, requests, consoleErrors, pageErrors } = await newPage(ctx, {
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
  });
  await page.goto(`${base}/index.html?mode=attack`, { waitUntil: 'load' });
  await page.waitForFunction(
    (n) => {
      const boxes = document.querySelectorAll('[data-testid="mermaid-diagram"]');
      if (boxes.length < n) return false;
      return document.querySelectorAll('[data-testid="mermaid-diagram"] [role="status"]').length === 0;
    },
    appPathSamples.length,
    { timeout: 120000 },
  );
  const scan = await page.evaluate(() => {
    const STRICT = ['script', 'foreignobject', 'iframe', 'object', 'embed', 'image', 'animate', 'set', 'handler', 'link', 'meta', 'base', 'form', 'input', 'textarea', 'style', 'audio', 'video'];
    const out = [];
    const useRefs = [];
    const texts = [];
    const boxes = Array.from(document.querySelectorAll('[data-testid="mermaid-diagram"]'));
    for (const box of boxes) {
      const attackId = box.closest('[data-attack-id]')?.getAttribute('data-attack-id') ?? '?';
      const svg = box.querySelector('svg');
      const problems = [];
      if (svg) {
        for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
          const tag = el.tagName.toLowerCase();
          if (STRICT.includes(tag)) problems.push(`element:${tag}`);
          if (tag === 'use') useRefs.push(el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '');
          for (const a of Array.from(el.attributes)) {
            const n = a.name.toLowerCase();
            const v = a.value;
            if (n.startsWith('on')) problems.push(`attr:${n}`);
            if (/^\s*javascript:/i.test(v)) problems.push(`js-url:${n}`);
            if (/data:text\/html/i.test(v)) problems.push(`data-url:${n}`);
            if (/url\(\s*['"]?(?!#)/i.test(v)) problems.push(`paint-url:${n}`);
            if (n === 'href' || n.endsWith(':href')) {
              if (/^(https?:)?\/\//i.test(v.trim())) problems.push(`external-href:${n}`);
            }
          }
        }
        const t = (svg.textContent ?? '').trim();
        texts.push({ attackId, text: t.slice(0, 160), hasPayloadText: /<script|onerror=|javascript:|evil\.invalid/i.test(t) });
      }
      out.push({ attackId, rendered: !!svg, fallback: !!box.querySelector('p[role="alert"]'), problems });
    }
    return {
      out,
      useRefs,
      texts,
      pwned: window.__pwned ?? 0,
      cspViolations: window.__cspViolations ?? [],
    };
  });
  const external = requests.filter((r) => !isLocal(r.url));
  results.attacks = {
    sampleCount: appPathSamples.length,
    rendered: scan.out.filter((r) => r.rendered).length,
    fallback: scan.out.filter((r) => r.fallback).length,
    violationCount: scan.out.reduce((a, r) => a + r.problems.length, 0),
    violations: scan.out.filter((r) => r.problems.length > 0).map((r) => ({ ...r })),
    useRefs: scan.useRefs,
    payloadTextVisible: scan.texts.filter((t) => t.hasPayloadText).map((t) => t.attackId),
    pwned: scan.pwned,
    externalRequests: external,
    externalRequestCount: external.length,
    cspViolations: scan.cspViolations,
    consoleErrors,
    pageErrors,
    samples: scan.out,
  };
  await ctx.close();
}

// ── 5. ② sanitizer 직접 경계 ────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const { page, pageErrors } = await newPage(ctx, {
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
  });
  await page.goto(`${base}/index.html?mode=attack`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__sanitize === 'function', null, { timeout: 60000 });
  const evaluated = await page.evaluate((cases) => {
    return cases.map((c) => {
      let out = null;
      let threw = null;
      try {
        out = window.__sanitize(c.svg);
      } catch (e) {
        threw = String(e?.message ?? e);
      }
      return {
        id: c.id,
        expect: c.expect,
        note: c.note ?? null,
        threw,
        blocked: out === null,
        allowed: out !== null,
        matched: out === null ? c.expect === 'block' : c.expect === 'allow',
        outPrefix: out ? out.slice(0, 160) : null,
      };
    });
  }, sanitizeCases);
  results.sanitizeBoundary = {
    caseCount: sanitizeCases.length,
    blockedCount: evaluated.filter((r) => r.blocked).length,
    allowedCount: evaluated.filter((r) => r.allowed).length,
    mismatches: evaluated.filter((r) => !r.matched).map((r) => ({ id: r.id, expect: r.expect, actual: r.blocked ? 'block' : 'allow', note: r.note })),
    cases: evaluated,
    pageErrors,
  };
  await ctx.close();
}

// ── 6. ③ viewport × light/dark ──────────────────────────────────────────────
{
  const viewports = [];
  for (const width of VIEWPORTS) {
    for (const colorScheme of COLOR_SCHEMES) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      const { page, requests, consoleErrors, pageErrors } = await newPage(ctx, {
        viewport: { width, height: 900 },
        colorScheme,
      });
      await page.goto(`${base}/index.html?mode=diagrams`, { waitUntil: 'load' });
      await page.waitForFunction(
        (n) => {
          const boxes = document.querySelectorAll('[data-testid="mermaid-diagram"]');
          if (boxes.length < n) return false;
          return document.querySelectorAll('[data-testid="mermaid-diagram"] [role="status"]').length === 0;
        },
        dataset.total,
        { timeout: 120000 },
      );
      const m = await page.evaluate(MEASURE);
      const els = await page.evaluate(OVERFLOW_ELEMENTS);
      const styles = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const box = document.querySelector('[data-testid="mermaid-diagram"]');
        const b = box ? getComputedStyle(box) : null;
        return {
          bodyBackground: body.backgroundColor,
          bodyColor: body.color,
          diagramBackground: b?.backgroundColor ?? null,
          diagramColor: b?.color ?? null,
        };
      });
      viewports.push({
        width,
        colorScheme,
        pageOverflowPx: m.pageOverflowPx,
        bodyOverflowPx: m.bodyOverflowPx,
        overflowElementCount: els.length,
        overflowElements: els,
        rendered: m.items.filter((i) => i.rendered).length,
        fallback: m.items.filter((i) => i.fallback).length,
        internalOverflowCount: m.items.filter((i) => i.internalOverflowPx > 1).length,
        maxInternalOverflowPx: round2(Math.max(0, ...m.items.map((i) => i.internalOverflowPx))),
        textClippedCount: m.items.filter((i) => i.textClipped).length,
        minFontPx: round2(Math.min(...m.items.map((i) => i.minFontPx || 99))),
        minContrast: round2(Math.min(...m.items.map((i) => i.contrast || 0))),
        maxTextLen: Math.max(...m.items.map((i) => i.maxTextLen || 0)),
        svgWidthMin: round2(Math.min(...m.items.map((i) => i.svgRect?.width ?? 0))),
        svgWidthMax: round2(Math.max(...m.items.map((i) => i.svgRect?.width ?? 0))),
        duplicateIds: m.duplicateIds,
        styles,
        externalRequestCount: requests.filter((r) => !isLocal(r.url)).length,
        consoleErrors,
        pageErrors,
      });
      if (colorScheme === 'light') {
        await page.screenshot({ path: join(shotDir, `pele-viewport-${width}.png`) });
      }
      await ctx.close();
    }
  }
  results.viewports = {
    viewports,
    darkIdenticalToLight: VIEWPORTS.every((w) => {
      const l = viewports.find((v) => v.width === w && v.colorScheme === 'light');
      const d = viewports.find((v) => v.width === w && v.colorScheme === 'dark');
      return (
        l.pageOverflowPx === d.pageOverflowPx &&
        l.internalOverflowCount === d.internalOverflowCount &&
        JSON.stringify(l.styles) === JSON.stringify(d.styles)
      );
    }),
    screenshots: VIEWPORTS.map((w) => `screenshots/pele-viewport-${w}.png`),
  };
}

// ── 7. ④ 첫 SVG cold/warm p50 3회 ───────────────────────────────────────────
{
  const runs = [];
  for (let i = 0; i < PERF_RUNS; i += 1) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const { page, requests } = await newPage(ctx, {
      viewport: { width: 1280, height: 900 },
      colorScheme: 'light',
    });
    await page.goto(`${base}/index.html?mode=perf&index=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window.__marks?.length ?? 0) >= 1, null, { timeout: 60000 });
    const cold = await page.evaluate(() => ({
      firstSvgMs: window.__firstSvgMs,
      js: window.__jsAtFirstSvg,
      marks: [...(window.__marks ?? [])],
    }));
    // warm — 동일 컴포넌트 remount(모듈·코드 캐시 적중) 후 첫 SVG까지.
    // 클릭은 페이지 내부 시계에서 기록해 Playwright 조작 지연이 측정값에 섞이지 않게 한다.
    const clickAt = await page.evaluate(() => {
      const t = performance.now();
      document.getElementById('remount').click();
      return t;
    });
    await page.waitForFunction(() => (window.__marks?.length ?? 0) >= 2, null, { timeout: 60000 });
    const warmMark = await page.evaluate(() => window.__marks[1]);
    runs.push({
      run: i + 1,
      coldMs: round2(cold.firstSvgMs ?? 0),
      warmMs: round2((warmMark ?? 0) - clickAt),
      jsAtFirstSvg: cold.js,
      scriptsRequested: requests.filter((r) => r.type === 'script').length,
    });
    await ctx.close();
  }
  results.perf = {
    runs: PERF_RUNS,
    coldP50: round2(median(runs.map((r) => r.coldMs))),
    warmP50: round2(median(runs.map((r) => r.warmMs))),
    coldMs: runs.map((r) => r.coldMs),
    warmMs: runs.map((r) => r.warmMs),
    jsAtFirstSvg: runs.map((r) => r.jsAtFirstSvg),
    note: '하네스 번들 기준 — 제품 배포 번들과는 엔트리 구성이 달라 직접 비교 불가(감소율 산출 금지).',
    detail: runs,
  };
}

await browser.close();
stopServer();

// ── 8. 산출물 저장 ───────────────────────────────────────────────────────────
writeFileSync(join(outDir, 'validation-results.json'), `${JSON.stringify(results, null, 2)}\n`);

const summary = {
  diagrams: {
    total: results.diagrams.total,
    rendered: results.diagrams.rendered,
    fallback: results.diagrams.fallback,
    internalOverflow: results.diagrams.internalOverflowCount,
    textClipped: results.diagrams.textClippedCount,
    duplicateIds: results.diagrams.duplicateIds.length,
    pageOverflowPx: results.diagrams.pageOverflowPx,
  },
  attacks: {
    samples: results.attacks.sampleCount,
    violationCount: results.attacks.violationCount,
    externalRequests: results.attacks.externalRequestCount,
    pwned: results.attacks.pwned,
    cspViolations: results.attacks.cspViolations.length,
  },
  sanitizeBoundary: {
    cases: results.sanitizeBoundary.caseCount,
    mismatches: results.sanitizeBoundary.mismatches.length,
  },
  viewports: results.viewports.viewports.map((v) => ({
    w: v.width,
    theme: v.colorScheme,
    overflowPx: v.pageOverflowPx,
    internal: v.internalOverflowCount,
    clipped: v.textClippedCount,
    rendered: v.rendered,
    fallback: v.fallback,
  })),
  perf: { coldP50: results.perf.coldP50, warmP50: results.perf.warmP50, runs: results.perf.runs },
};
writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

// ── 9. 콘솔 요약 ─────────────────────────────────────────────────────────────
log('\n=== #179 Pele 독립 검증 요약 ===');
log(`① 도식 ${summary.diagrams.rendered}/${summary.diagrams.total} 렌더 · 폴백 ${summary.diagrams.fallback} · 내부오버플로 ${summary.diagrams.internalOverflow} · 텍스트잘림 ${summary.diagrams.textClipped} · 페이지 가로오버플로 ${summary.diagrams.pageOverflowPx}px · id중복 ${summary.diagrams.duplicateIds}`);
log(`② 악성 ${summary.attacks.samples}종 · 위반요소 ${summary.attacks.violationCount} · 외부요청 ${summary.attacks.externalRequests} · 실행(canary) ${summary.attacks.pwned} · CSP위반 ${summary.attacks.cspViolations}`);
log(`   sanitizer 직접경계 ${summary.sanitizeBoundary.cases}종 · 기대불일치 ${summary.sanitizeBoundary.mismatches}`);
log(`③ viewport 가로오버플로(px) ${summary.viewports.map((v) => `${v.w}/${v.theme[0]}:${v.overflowPx}`).join(' ')}`);
log(`④ 첫 SVG cold p50 ${summary.perf.coldP50}ms · warm p50 ${summary.perf.warmP50}ms (${summary.perf.runs}회)`);
log(`\n결과 파일 → ${join(outDir, 'validation-results.json')} / summary.json`);
