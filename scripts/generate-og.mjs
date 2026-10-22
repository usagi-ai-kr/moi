// scripts/generate-og.mjs
// OG 공유 카드(1200×630) 재현 생성 스크립트 — Playwright Chromium, 새 의존성 없음.
// 사용법: node scripts/generate-og.mjs   (public/og/moi-og.png 생성)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'public', 'og', 'moi-og.png');
const crackerSvg = readFileSync(path.join(root, 'public', 'branding', 'moi-cracker.svg'), 'utf8');

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<style>
  html, body { margin: 0; padding: 0; width: 1200px; height: 630px; }
  body {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #F7F8FA;
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
  }
  .card {
    width: 1080px;
    height: 510px;
    background: #FFFFFF;
    border-radius: 28px;
    box-shadow: 0 24px 64px rgba(35, 47, 62, 0.12);
    display: flex;
    align-items: center;
    gap: 64px;
    padding: 64px 72px;
    box-sizing: border-box;
  }
  .logo-wrap {
    flex: 0 0 256px;
    width: 256px;
    height: 256px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .logo-wrap svg { width: 256px; height: 256px; }
  .copy { flex: 1 1 auto; min-width: 0; }
  .eyebrow {
    font-size: 24px;
    font-weight: 600;
    color: #FF9900;
    letter-spacing: 0.02em;
    margin: 0 0 16px;
  }
  .title {
    font-size: 72px;
    line-height: 1.05;
    font-weight: 800;
    color: #232F3E;
    margin: 0;
  }
  .accent {
    width: 96px;
    height: 6px;
    background: #FF9900;
    border-radius: 3px;
    margin: 28px 0;
  }
  .desc {
    font-size: 30px;
    line-height: 1.4;
    color: #6B7280;
    margin: 0;
  }
  .foot {
    margin-top: 32px;
    font-size: 22px;
    color: #9CA3AF;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="logo-wrap">${crackerSvg}</div>
    <div class="copy">
      <p class="eyebrow">moi · 문제 중심 시험 대비</p>
      <h1 class="title">티끌 moi면<br/>합격</h1>
      <div class="accent"></div>
      <p class="desc">약한 데만 또 익히기</p>
      <p class="foot">moi.qus0in.workers.dev</p>
    </div>
  </div>
</body>
</html>`;

async function main() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    const png = await page.screenshot({ type: 'png', animations: 'disabled' });
    await page.close();
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, png);
    console.log(`생성: ${outPath} (${png.length} bytes)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
