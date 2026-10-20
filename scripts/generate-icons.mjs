// scripts/generate-icons.mjs
// 마스터 SVG(public/branding/moi-cracker.svg, B안 확정)에서 favicon/OS 아이콘 파생 자산을 재현 생성한다.
// - PNG 렌더: 저장소에 이미 설치된 playwright Chromium(외부 도구·네트워크·새 의존성 없음)
// - ICO: Node Buffer로 PNG-in-ICO 컨테이너를 직접 작성
// - maskable(192/512) 전용: 크래커를 중심 기준 0.84 배율로 축소해 80% 안전원(반지름 205) 안에 유지. 일반 favicon 크기는 유지.
// - 브라우저 크롬색(theme-color·manifest·TileColor)은 기존 #232F3E 유지. 흰/검정은 아이콘 자산에만 적용.
// 사용법:
//   node scripts/generate-icons.mjs            # public/ 재생성(B안 확정 기준)
//   node scripts/generate-icons.mjs --check    # 재생성 후 기존 자산과 해시 비교(결정성 검증)
//   node scripts/generate-icons.mjs --preview <출력경로.png>  # B안 확정 미리보기 한 장 생성(호환)
//   node scripts/generate-icons.mjs --preview-a <A.png> --preview-b <B.png>  # A/B 비교 미리보기 2장 생성(비교 옵션 유지)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public');
const PAPER = '#FFFFFF';
const CRACKER = '#0B0B0B';
const CHROME = '#232F3E'; // 앱 브라우저 크롬색 — 아이콘 교체와 무관하게 기존 유지
const MASK_SCALE = 0.84; // maskable 전용 축소 배율 — 일반 favicon 크기는 유지

// ---------------------------------------------------------------- 원본 마스터(B안 확정 2x2)
const master = readFileSync(path.join(outDir, 'branding/moi-cracker.svg'), 'utf8');

// 비교용 A안(3x3 구멍 9개): 미리보기 비교 옵션 유지용, 커밋·자산 생성은 B안 기준
const holesA = [
  '<circle cx="176" cy="176" r="24" fill="#FFFFFF"/>',
  '<circle cx="256" cy="176" r="24" fill="#FFFFFF"/>',
  '<circle cx="336" cy="176" r="24" fill="#FFFFFF"/>',
  '<circle cx="176" cy="256" r="24" fill="#FFFFFF"/>',
  '<circle cx="256" cy="256" r="24" fill="#FFFFFF"/>',
  '<circle cx="336" cy="256" r="24" fill="#FFFFFF"/>',
  '<circle cx="176" cy="336" r="24" fill="#FFFFFF"/>',
  '<circle cx="256" cy="336" r="24" fill="#FFFFFF"/>',
  '<circle cx="336" cy="336" r="24" fill="#FFFFFF"/>',
].join('\n    ');
const holesBCount = (master.match(/<circle[^>]*fill="#FFFFFF"[^>]*\/>/g) ?? []).length;
if (holesBCount !== 4) {
  throw new Error(`B안 구멍 4개 기대 → 실제 ${holesBCount}개 — 마스터 구조 확인 필요`);
}
const masterA = master.replace(/([ \t]*<circle[^>]*fill="#FFFFFF"[^>]*\/>\n?){4}/, `    ${holesA}\n`);

// 배경 라운드 제거 → 풀블리드 정사각(apple-touch·mstile에 사용, 일반 크기 유지)
const srcSquare = master.replace(/(<rect [^>]*?) rx="116"/, '$1');
const srcSquareA = masterA.replace(/(<rect [^>]*?) rx="116"/, '$1');
// maskable 전용: 회전 후 네 모서리가 80% 안전원(반지름 205) 밖으로 나가지 않게 중심 기준 축소
const toMaskable = (squareSvg) => squareSvg.replace(
  '<g transform="rotate(-12 256 256)">',
  `<g transform="translate(256 256) scale(${MASK_SCALE}) rotate(-12) translate(-256 -256)">`,
);
const srcMaskable = toMaskable(srcSquare);
const srcMaskableA = toMaskable(srcSquareA);
if (!srcMaskable.includes(`scale(${MASK_SCALE})`) || srcMaskable.includes('rotate(-12 256 256)')) {
  throw new Error('maskable 파생에 0.84 축소 transform이 적용되지 않았습니다');
}
// 단색 mask-icon 파생: 배경 rect를 완전히 제거하고 흰 구멍도 제거(솔리드 실루엣), 검정을 단색으로
// (배경이 남으면 Safari가 새 실루엣이 아니라 꽉 찬 사각형을 만든다)
const srcMaskIcon = master
  .replace(/\n\s*<rect [^>]*\/>/, '')
  .replace(/\n\s*<circle [^>]*fill="#FFFFFF"[^>]*\/>/g, '')
  .replace(/fill="#0B0B0B"/g, 'fill="currentColor"');

const masterRects = (master.match(/<rect /g) ?? []).length;
if (masterRects !== 1 || srcSquare === master || srcSquare.includes('rx="116"') || srcSquare.match(/<rect /g)?.length !== 1) {
  throw new Error('마스터 SVG 파생 규칙이 원본과 일치하지 않습니다 — 마스터 구조 확인 필요');
}
const maskRects = (srcMaskIcon.match(/<rect /g) ?? []).length;
if (!srcMaskIcon.includes('currentColor') || maskRects !== 0) {
  throw new Error('mask-icon 파생에 배경 rect가 남았거나 단색 채움이 누락되었습니다');
}
if (srcMaskIcon.includes(CRACKER) || srcMaskIcon.includes(PAPER)) {
  throw new Error('mask-icon 파생에 흰·검정 잔존 색이 있습니다 — 단색(currentColor)만 허용');
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

// ---------------------------------------------------------------- 자산 정의(브라우저 크롬색은 기존 잉크 유지)
const browserconfig = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="/icons/mstile-150.png"/>
      <TileColor>${CHROME}</TileColor>
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
  background_color: CHROME,
  theme_color: CHROME,
  icons: [
    { src: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-192.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/maskable-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

// ---------------------------------------------------------------- 생성(B안 확정 기준)
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

  // favicon.svg는 마스터(B안 확정)와 동일 아트
  writeAt('favicon.svg', master);
  // 일반 PNG: 라운드 배경(B안, 일반 크기 유지)
  for (const size of [16, 32, 48]) writeAt(`icons/icon-${size}.png`, await render(master, size));
  writeAt('icons/icon-192.png', await render(master, 192));
  writeAt('icons/icon-512.png', await render(master, 512));
  // apple-touch·mstile: 불투명 정사각 배경(일반 크기 유지)
  writeAt('icons/icon-180.png', await render(srcSquare, 180));
  writeAt('icons/mstile-150.png', await render(srcSquare, 150));
  // maskable: 불투명 정사각 배경 + 0.84 축소 크래커(안전원 준수)
  writeAt('icons/maskable-192.png', await render(srcMaskable, 192));
  writeAt('icons/maskable-512.png', await render(srcMaskable, 512));
  // favicon.ico(16/32/48) — 라운드 배경 PNG를 Node Buffer로 직접 패키징
  const icoSources = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await render(master, size) })));
  writeAt('favicon.ico', buildIco(icoSources));
  writeAt('icons/mask-icon.svg', srcMaskIcon);
  writeAt('browserconfig.xml', browserconfig);
  writeAt('site.webmanifest', `${JSON.stringify(manifest, null, 2)}\n`);
}


// ---------------------------------------------------------------- 미리보기(B 확정·A 비교)
async function generatePreview(browser, previewPath, variant) {
  const isA = variant === 'A';
  const svg = isA ? masterA : master;
  const srcMask = isA ? srcMaskableA : srcMaskable;
  const label = isA ? 'A안 3×3(비교용)' : 'B안 2×2(확정)';
  const holes = isA ? '구멍 9개(r=24)' : '큰 구멍 4개(r=34)';
  const url = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;
  const cell = (s, size, scale = 1) =>
    `<span style="display:inline-block;width:${size * scale}px;height:${size * scale}px">${svgCell(s, size * scale, scale > 1)}</span>`;
  const svgCell = (s, px, pixelated) =>
    `<img src="${url(s)}" style="width:${px}px;height:${px}px;image-rendering:${pixelated ? 'pixelated' : 'auto'}">`;
  const ring = (size) =>
    `<span style="position:absolute;inset:0;border:${size >= 400 ? 4 : 2}px dashed #4B9FE1;border-radius:50%;transform:scale(0.8)"></span>`;
  const masked = (s, size, radius) =>
    `<span style="position:relative;display:inline-block;width:${size}px;height:${size}px"><span style="position:absolute;inset:0;overflow:hidden;border-radius:${radius}px">${svgCell(s, size)}</span></span>`;

  const sizeRow = (bg, rowLabel) =>
    `<div style="display:flex;align-items:center;gap:28px;padding:20px 28px 28px;background:${bg}">
      <b style="writing-mode:vertical-rl;font:600 15px/1 ui-sans-serif;color:${bg === '#FFFFFF' ? CRACKER : '#F2F3F3'}">${rowLabel}</b>
      ${cell(svg, 16)}${cell(svg, 16, 8)}${cell(svg, 32)}${cell(svg, 32, 4)}${cell(svg, 48)}${cell(svg, 48, 3)}${cell(svg, 180)}
    </div>`;

  const html = `<!doctype html><body style="margin:0;width:1140px;font-family:system-ui,sans-serif;background:#FFFFFF;color:${CRACKER}">
  <h2 style="margin:18px 28px 0;font:700 20px/1.2 ui-sans-serif">moi 아이콘 — #70 크래커 ${label} · ${holes} · 기울기 -12° · 흰바탕+검정 실루엣</h2>
  <p style="margin:6px 28px 0;font:400 14px/1.6 system-ui,sans-serif">확정 preview — 16/32/48/180 · 라이트/다크 나란히. 16px에서 사각 크래커 윤곽과 구멍이 식별되는지, -12° 기울기 실루엣을 확인한다. 커밋·자산은 B안 확정 기준. maskable은 0.84 축소로 안전원(80%, 점선) 안에 들어간다.</p>
  ${sizeRow('#FFFFFF', '라이트')}
  ${sizeRow('#2D3B4E', '다크')}
  <div style="display:flex;align-items:center;gap:44px;padding:8px 28px 22px;background:#FFFFFF">
    <b style="writing-mode:vertical-rl;font:600 15px/1 ui-sans-serif;color:${CRACKER}">maskable</b>
    <span style="position:relative;display:inline-block">${masked(srcMask, 320, 999)}${ring(320)}</span>
    <span style="position:relative;display:inline-block">${masked(srcMask, 320, 71)}${ring(320)}</span>
    <span style="position:relative;display:inline-block">${masked(srcMask, 200, 0)}${ring(200)}</span>
  </div>
  <p style="margin:0;padding:0 28px 14px;font:400 15px/1.6 system-ui,sans-serif;color:${CRACKER}">maskable 위 행 — 왼쪽부터: 원 마스크 · 둥근 사각 마스크 · 정사각 + 안전영역(80% 원, 점선). maskable 파생은 0.84 축소라 실루엣이 점선 원 밖으로 나가지 않는다. 일반 favicon 크기는 유지된다.</p>
</body>`;
  const page = await browser.newPage({ viewport: { width: 1140, height: 960 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.locator('body').screenshot({ path: previewPath, animations: 'disabled' });
  await page.close();
}

// ---------------------------------------------------------------- main
const argv = process.argv.slice(2);
const checkMode = argv.includes('--check');
const previewIdx = argv.indexOf('--preview');
const previewAIdx = argv.indexOf('--preview-a');
const previewBIdx = argv.indexOf('--preview-b');

await withBrowser(async (browser) => {
  const hasPreview = previewAIdx !== -1 || previewBIdx !== -1 || previewIdx !== -1;
  if (previewAIdx !== -1) {
    const p = argv[previewAIdx + 1];
    if (!p) throw new Error('--preview-a <출력경로.png> 필요');
    await generatePreview(browser, p, 'A');
    console.log(`[icons] preview A → ${p}`);
  }
  if (previewBIdx !== -1) {
    const p = argv[previewBIdx + 1];
    if (!p) throw new Error('--preview-b <출력경로.png> 필요');
    await generatePreview(browser, p, 'B');
    console.log(`[icons] preview B → ${p}`);
  }
  if (previewIdx !== -1 && previewAIdx === -1 && previewBIdx === -1) {
    const previewPath = argv[previewIdx + 1];
    if (!previewPath) throw new Error('--preview <출력경로.png> 필요');
    await generatePreview(browser, previewPath, 'B');
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
  } else if (!hasPreview) {
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
