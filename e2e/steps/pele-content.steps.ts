import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const { Given, When, Then } = createBdd();
const CONTENT_ROOT = 'content/questions';
const VIEWPORTS = [320, 375, 768, 1024, 1280];

interface DiagramInput {
  questionId: string;
  packId: string;
  type: string;
  code: string;
}

interface RenderFailure {
  questionId: string;
  packId: string;
  type: string;
  browser: string;
  width: number;
  reason: string;
}

let inventory: DiagramInput[] = [];
let failures: RenderFailure[] = [];
let matrix: Array<{ width: number; rendered: number; failures: number; pageOverflow: boolean }> = [];

function questionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return questionFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  });
}

function collectDiagrams(): DiagramInput[] {
  return questionFiles(CONTENT_ROOT).flatMap((file) => {
    const pack = JSON.parse(readFileSync(file, 'utf8')) as {
      packId: string;
      items: Array<{ questionId: string; explanation: string }>;
    };
    return pack.items.flatMap((item) => {
      const blocks: DiagramInput[] = [];
      const re = /```mermaid\s*\n([\s\S]*?)```/gim;
      for (const match of item.explanation.matchAll(re)) {
        const code = match[1].trim();
        blocks.push({
          questionId: item.questionId,
          packId: pack.packId || relative(CONTENT_ROOT, file),
          type: code.split(/\s+/, 1)[0].toLowerCase(),
          code,
        });
      }
      return blocks;
    });
  });
}

Given('해설 전체 Mermaid 콘텐츠가 준비되면', async () => {
  inventory = collectDiagrams();
  failures = [];
  matrix = [];
  expect(inventory).toHaveLength(71);
  expect(inventory.filter((entry) => entry.type === 'flowchart')).toHaveLength(66);
  expect(inventory.filter((entry) => entry.type === 'sequencediagram')).toHaveLength(5);
});

When('Chromium 또는 WebKit에서 다섯 화면 폭으로 전수 렌더하면', async ({ page }) => {
  await page.goto('/');
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    const browser = page.context().browser()?.browserType().name() ?? 'unknown';
    const row = await page.evaluate(async ({ diagrams, width, browser }) => {
      const rendererPath = '/src/ui/study/diagram-pele.ts';
      const { renderPeleDiagram } = await import(/* @vite-ignore */ rendererPath);
      const prior = document.querySelector('[data-pele-content-matrix]');
      prior?.remove();
      const root = document.createElement('main');
      root.dataset.peleContentMatrix = 'true';
      root.style.cssText = 'position:fixed;top:0;left:16px;width:calc(100vw - 32px);height:100vh;overflow:auto;background:white;z-index:2147483647;';
      document.body.appendChild(root);
      const failed: RenderFailure[] = [];
      let rendered = 0;
      for (let index = 0; index < diagrams.length; index += 1) {
        const diagram = diagrams[index];
        const card = document.createElement('section');
        card.className = 'moi-mermaid';
        card.style.cssText = 'box-sizing:border-box;width:100%;min-width:0;max-width:100%;overflow-x:auto;';
        root.appendChild(card);
        try {
          const output = await renderPeleDiagram({
            code: diagram.code,
            idPrefix: `pele-matrix-${width}-${index}`,
            maxWidth: Math.max(160, card.clientWidth - 16),
          });
          if (!output?.svg) {
            failed.push({ ...diagram, browser, width, reason: 'renderer returned null' });
            card.remove();
            continue;
          }
          card.innerHTML = output.svg;
          const svg = card.querySelector('svg');
          const rect = svg?.getBoundingClientRect();
          if (!svg || !rect || rect.width <= 0 || rect.height <= 0 || getComputedStyle(svg).display === 'none') {
            failed.push({ ...diagram, browser, width, reason: 'SVG missing or not displayed' });
            card.remove();
            continue;
          }
          if (root.scrollWidth > root.clientWidth + 1) {
            failed.push({ ...diagram, browser, width, reason: 'content escaped the contained scroll area' });
            card.remove();
            continue;
          }
          rendered += 1;
        } catch (error) {
          failed.push({ ...diagram, browser, width, reason: error instanceof Error ? error.message : String(error) });
        }
        card.remove();
      }
      const pageOverflow = document.documentElement.scrollWidth > width + 1;
      root.remove();
      return { width, rendered, failures: failed, pageOverflow };
    }, { diagrams: inventory, width, browser });
    failures.push(...row.failures);
    matrix.push({ width, rendered: row.rendered, failures: row.failures.length, pageOverflow: row.pageOverflow });
    console.log(`[pele-content] browser=${page.context().browser()?.browserType().name()} width=${width} rendered=${row.rendered}/${inventory.length} failures=${row.failures.length}`);
  }
  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/335-pele-content-matrix.json', JSON.stringify({ browser: page.context().browser()?.browserType().name(), matrix, failures }, null, 2));
});

Then('모든 도식이 sanitizer 통과 SVG로 표시되고 페이지 넘침이 없다', async () => {
  expect(matrix).toEqual(VIEWPORTS.map((width) => ({ width, rendered: inventory.length, failures: 0, pageOverflow: false })));
  expect(failures).toEqual([]);
});
