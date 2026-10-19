// scripts/generate-icons.mjs
// 마스터 SVG(public/branding/moi-bird.svg)에서 favicon/OS 아이콘 파생 자산을 재현 생성한다.
// - PNG 렌더: 저장소에 이미 설치된 playwright Chromium(외부 도구·네트워크·새 의존성 없음)
// - ICO: Node Buffer로 PNG-in-ICO 컨테이너를 직접 작성
// 사용법:
//   node scripts/generate-icons.mjs            # public/ 재생성
//   node scripts/generate-icons.mjs --check    # 재생성 후 기존 자산과 해시 비교(결정성 검증)
//   node scripts/generate-icons.mjs --preview <출력경로.png>  # 디자인 미리보기 한 장 생성
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public');
const INK = '#232F3E';

// ---------------------------------------------------------------- 원본 마스터
const master = readFileSync(path.join(outDir, 'branding/moi-bird.svg'), 'utf8');

// 배경 라운드 제거 → 풀블리드 정사각(maskable·apple-touch·mstile에 사용)
const srcSquare = master.replace(/(<rect [^>]*?) rx="116"/, '$1');
// 단색 mask-icon 파생: 배경 rect를 완전히 제거하고 눈도 제거, 모든 채움을 단색으로
// (배경이 남으면 Safari가 새 실루엣이 아니라 꽉 찬 사각형을 만든다)
const srcMaskIcon = master
  .replace(/\n\s*<rect [^>]*\/>/, '')
  .replace(/<circle cx="322"[^>]*\/>\n|<circle cx="326"[^>]*\/>\n/g, '')
  .replace(/fill="#FF9900"|fill="#D97A08"|fill="#F2EDE4"/g, 'fill="currentColor"');

const masterRects = (master.match(/<rect /g) ?? []).length;
if (masterRects !== 1 || srcSquare === master || srcSquare.includes('rx="116"') || srcSquare.match(/<rect /g)?.length !== 1) {
  throw new Error('마스터 SVG 파생 규칙이 원본과 일치하지 않습니다 — 마스터 구조 확인 필요');
}
const maskRects = (srcMaskIcon.match(/<rect /g) ?? []).length;
if (!srcMaskIcon.includes('currentColor') || maskRects !== 0) {
  throw new Error('mask-icon 파생에 배경 rect가 남았거나 단색 채움이 누락되었습니다');
}

// ---------------------------------------------------------------- PNG 렌더
async function withBrowser(fn) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function renderSvgToPng(browser, svg, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${dataUrl}">`,
  );
  const png = await page.locator('img').screenshot({ omitBackground: true, animations: 'disabled' });
  await page.close();
  return png;
}

// ---------------------------------------------------------------- ICU 컨테이너
function buildIco(pngs) {
  let offset = 6 + pngs.length * 16;
  const entries = [];
  const blobs = [];
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(data);
    offset += data.length;
  }
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(pngs.length, 4);
  return Buffer.concat([head, ...entries, ...blobs]);
}

const pngHeader = (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const ihdrSize = (buffer) => ({
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20),
});

// ---------------------------------------------------------------- 자산 정의
const browserconfig = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="/icons/mstile-150.png"/>
      <TileColor>${INK}</TileColor>
    </tile>
  </msapplication>
</browserconfig>
`;

const manifest = {
  name: 'moi',
  short_name: 'moi',
  description: '문제 중심 시험 대비 플랫폼',
  start_url: '/',
  display: 'standalone',
  background_color: INK,
  theme_color: INK,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

// ---------------------------------------------------------------- 생성
async function generate(browser, targetRoot) {
  const writeAt = (rel, data) => {
    const target = path.join(targetRoot, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, data);
  };
  const render = async (svg, size) => ihdrCheck(await renderSvgToPng(browser, svg, size), size);
  const ihdrCheck = (buffer, size) => {
    const dims = ihdrSize(buffer);
    if (!pngHeader(buffer) || dims.width !== size || dims.height !== size) {
      throw new Error(`PNG 크기 불일치: 요청 ${size} → 실제 ${JSON.stringify(dims)}`);
    }
    return buffer;
  };

  // favicon.svg는 마스터와 동일 아트
  writeAt('favicon.svg', master);
  // 일반 PNG: 라운드 배경
  for (const size of [16, 32, 48]) writeAt(`icons/icon-${size}.png`, await render(master, size));
  writeAt('icons/icon-192.png', await render(master, 192));
  writeAt('icons/icon-512.png', await render(master, 512));
  // apple-touch·maskable·mstile: 불투명 정사각 배경
  writeAt('icons/icon-180.png', await render(srcSquare, 180));
  writeAt('icons/maskable-192.png', await render(srcSquare, 192));
  writeAt('icons/maskable-512.png', await render(srcSquare, 512));
  writeAt('icons/mstile-150.png', await render(srcSquare, 150));
  // favicon.ico(16/32/48) — 라운드 배경 PNG를 Node Buffer로 직접 패키징
  const icoSources = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await render(master, size) })));
  writeAt('favicon.ico', buildIco(icoSources));
  writeAt('icons/mask-icon.svg', srcMaskIcon);
  writeAt('browserconfig.xml', browserconfig);
  writeAt('site.webmanifest', `${JSON.stringify(manifest, null, 2)}\n`);
}


// ---------------------------------------------------------------- 미리보기
async function generatePreview(browser, previewPath) {
  const url = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const cell = (svg, size, scale = 1) =>
    `<span style="display:inline-block;width:${size * scale}px;height:${size * scale}px">${svgCell(svg, size * scale, scale > 1)}</span>`;
  const svgCell = (svg, px, pixelated) =>
    `<img src="${url(svg)}" style="width:${px}px;height:${px}px;image-rendering:${pixelated ? 'pixelated' : 'auto'}">`;
  const ring = (size) =>
    `<span style="position:absolute;inset:0;border:${size >= 400 ? 4 : 2}px dashed #4B9FE1;border-radius:50%;transform:scale(0.8)"></span>`;
  const masked = (svg, size, radius) =>
    `<span style="position:relative;display:inline-block;width:${size}px;height:${size}px"><span style="position:absolute;inset:0;overflow:hidden;border-radius:${radius}px">${svgCell(svg, size)}</span></span>`;

  const sizeRow = (bg, label) =>
    `<div style="display:flex;align-items:center;gap:28px;padding:20px 28px 28px;background:${bg}">
      <b style="writing-mode:vertical-rl;font:600 15px/1 ui-sans-serif;color:${bg === '#FFFFFF' ? INK : '#F2F3F3'}">${label}</b>
      ${cell(master, 16)}${cell(master, 16, 8)}${cell(master, 32)}${cell(master, 32, 4)}${cell(master, 48)}${cell(master, 48, 3)}${cell(master, 180)}
    </div>`;

  const html = `<!doctype html><body style="margin:0;width:1140px;font-family:system-ui,sans-serif;background:#FFFFFF;color:${INK}">
  <h2 style="margin:18px 28px 0;font:700 20px/1.2 ui-sans-serif">moi 아이콘 — #70 새(모이 쪼기) · 마스터 SVG 파생</h2>
  ${sizeRow('#FFFFFF', '라이트')}
  ${sizeRow('#2D3B4E', '다크')}
  <div style="display:flex;align-items:center;gap:44px;padding:8px 28px 22px;background:#FFFFFF">
    <b style="writing-mode:vertical-rl;font:600 15px/1 ui-sans-serif;color:${INK}">maskable</b>
    <span style="position:relative;display:inline-block">${masked(srcSquare, 320, 999)}${ring(320)}</span>
    <span style="position:relative;display:inline-block">${masked(srcSquare, 320, 71)}${ring(320)}</span>
    <span style="position:relative;display:inline-block">${masked(srcSquare, 200, 0)}${ring(200)}</span>
  </div>
  <p style="margin:0;padding:0 28px 14px;font:400 15px/1.6 system-ui,sans-serif;color:${INK}">maskable 위 행 — 왼쪽부터: 원 마스크 · 둥근 사각 마스크 · 정사각 + 안전영역(80% 원, 점선). 모이 씨앗과 새 실루엣 전체가 안전영역 안에 유지된다.</p>
</body>`;
  const page = await browser.newPage({ viewport: { width: 1140, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.locator('body').screenshot({ path: previewPath, animations: 'disabled' });
  await page.close();
}

// ---------------------------------------------------------------- main
const argv = process.argv.slice(2);
const checkMode = argv.includes('--check');
const previewIdx = argv.indexOf('--preview');

await withBrowser(async (browser) => {
  if (previewIdx !== -1) {
    const previewPath = argv[previewIdx + 1];
    if (!previewPath) throw new Error('--preview <출력경로.png> 필요');
    await generatePreview(browser, previewPath);
    console.log(`[icons] preview → ${previewPath}`);
  }
  if (checkMode) {
    // 기존 자산을 건드리지 않고 임시 디렉터에 재생성해 비교 (해시결정성 검증)
    const tmpRoot = path.join(root, 'node_modules/.tmp-icons-check');
    await generate(browser, tmpRoot);
    const before = shaOfTree(outDir);
    const after = shaOfTree(tmpRoot);
    const diffs = before.map((line, i) => (line !== after[i] ? line : null)).filter(Boolean);
    const stable = diffs.length === 0;
    console.log(`[icons] --check: ${stable ? 'PASS — 재생성 해시 일치(결정성 확인)' : `FAIL — 스크립트 산출물과 다른 자산 ${diffs.length}개\n${diffs.join('\n')}`}`);
    process.exitCode = stable ? 0 : 1;
  } else {
    await generate(browser, outDir);
    console.log('[icons] public/ 아이콘 자산 재생성 완료 (favicon.svg/ico, icons/*, browserconfig.xml, site.webmanifest)');
  }
});

function shaOfTree(dir) {
  const files = [
    'favicon.svg', 'favicon.ico', 'browserconfig.xml', 'site.webmanifest',
    'icons/mask-icon.svg',
    ...[16, 32, 48, 180, 192, 512].map((s) => `icons/icon-${s}.png`),
    'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/mstile-150.png',
  ];
  return files.map((f) => {
    const p = path.join(dir, f);
    return existsSync(p) ? `${f}=${crypto.createHash('sha256').update(readFileSync(p)).digest('hex')}` : `${f}=MISSING`;
  });
}
