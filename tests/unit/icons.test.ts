// #70 favicon·OS 아이콘 자산 검증 — 크래커(B안 확정) 마스터 계약.
// 새로운 의존성 없이 Node Buffer+zlib으로 PNG IHDR·픽셀과 ICO 컨테이너를 직접 파싱한다.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const publicDir = path.resolve(__dirname, '../../public');

const readPublic = (rel: string) => readFileSync(path.join(publicDir, rel));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngDims(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(buffer.readUInt32BE(8)).toBe(13); // IHDR 길이
  expect(buffer.toString('ascii', 12, 16)).toBe('IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// 최소 PNG 디코더(bitDepth 8 · colorType 2/6) — RGB 픽셀 반환.
function pngPixels(buffer: Buffer): { width: number; height: number; rgb: Buffer } {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(bitDepth).toBe(8);
  expect([2, 6]).toContain(colorType); // RGB 또는 RGBA 렌더 기대
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  expect(raw.length).toBe(height * (1 + stride));

  const rgb = Buffer.alloc(width * height * 3);
  let prev = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const cur = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    const recon = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? recon[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let val: number;
      switch (filter) {
        case 0:
          val = cur[i];
          break;
        case 1:
          val = (cur[i] + a) & 0xff;
          break;
        case 2:
          val = (cur[i] + b) & 0xff;
          break;
        case 3:
          val = (cur[i] + ((a + b) >> 1)) & 0xff;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          val = (cur[i] + pr) & 0xff;
          break;
        }
        default:
          throw new Error(`지원하지 않는 PNG 필터: ${filter}`);
      }
      recon[i] = val;
    }
    for (let x = 0; x < width; x += 1) {
      rgb[(y * width + x) * 3] = recon[x * channels];
      rgb[(y * width + x) * 3 + 1] = recon[x * channels + 1];
      rgb[(y * width + x) * 3 + 2] = recon[x * channels + 2];
    }
    prev = recon;
  }
  return { width, height, rgb };
}

function pngDarkRatio(buffer: Buffer): { total: number; dark: number; ratio: number } {
  const { width, height, rgb } = pngPixels(buffer);
  const total = width * height;
  let dark = 0;
  for (let i = 0; i < total; i += 1) {
    if (rgb[i * 3] < 128 && rgb[i * 3 + 1] < 128 && rgb[i * 3 + 2] < 128) dark += 1;
  }
  return { total, dark, ratio: dark / total };
}

describe('아이콘 자산 존재', () => {
  const required = [
    'branding/moi-cracker.svg',
    'favicon.svg',
    'favicon.ico',
    'icons/icon-16.png',
    'icons/icon-32.png',
    'icons/icon-48.png',
    'icons/icon-180.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/maskable-192.png',
    'icons/maskable-512.png',
    'icons/mask-icon.svg',
    'icons/mstile-150.png',
    'browserconfig.xml',
    'site.webmanifest',
  ];

  it('public/ 산출물이 모두 존재한다', () => {
    for (const rel of required) {
      expect(existsSync(path.join(publicDir, rel)), rel).toBe(true);
    }
  });

  it('기존 새 마스터(moi-bird.svg)는 삭제되고 크래커로 대체된다', () => {
    expect(existsSync(path.join(publicDir, 'branding/moi-bird.svg'))).toBe(false);
    expect(existsSync(path.join(publicDir, 'branding/moi-cracker.svg'))).toBe(true);
  });

  it('기존 public 파일(robots.txt)은 유지된다', () => {
    expect(existsSync(path.join(publicDir, 'robots.txt'))).toBe(true);
  });
});

describe('PNG 치수(IHDR)', () => {
  const cases: Array<[string, number]> = [
    ['icons/icon-16.png', 16],
    ['icons/icon-32.png', 32],
    ['icons/icon-48.png', 48],
    ['icons/icon-180.png', 180],
    ['icons/icon-192.png', 192],
    ['icons/icon-512.png', 512],
    ['icons/maskable-192.png', 192],
    ['icons/maskable-512.png', 512],
    ['icons/mstile-150.png', 150],
  ];

  it.each(cases)('%s는 %dx%d 정사각이다', (rel, size) => {
    expect(pngDims(readPublic(rel))).toEqual({ width: size, height: size });
  });
});

describe('favicon.ico 컨테이너', () => {
  it('PNG-in-ICO 엔트리(16/32/48)·오프셋·실제 치수가 유효하다', () => {
    const ico = readPublic('favicon.ico');
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);

    const seenWidths: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const entry = ico.subarray(6 + i * 16, 6 + (i + 1) * 16);
      const width = entry.readUInt8(0);
      const height = entry.readUInt8(1);
      const dataLength = entry.readUInt32LE(8);
      const dataOffset = entry.readUInt32LE(12);
      seenWidths.push(width);
      expect(width).toBe(height);
      const data = ico.subarray(dataOffset, dataOffset + dataLength);
      expect(data.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(pngDims(data)).toEqual({ width, height });
      expect(dataOffset).toBeGreaterThanOrEqual(6 + count * 16);
      if (i === count - 1) {
        expect(dataOffset + dataLength).toBe(ico.length); // 마지막 엔트리가 파일 끝
      }
    }
    expect(seenWidths).toEqual([16, 32, 48]);
  });
});

describe('SVG 마스터와 파생', () => {
  it('마스터는 흰 라운드 배경+검정 크래커(-12°)·viewBox 512를 쓴다', () => {
    const master = readPublic('branding/moi-cracker.svg').toString('utf8');
    expect(master).toContain('viewBox="0 0 512 512"');
    expect(master).toContain('fill="#FFFFFF"'); // 흰 배경(아이콘 자산에만 적용)
    expect(master).toContain('fill="#0B0B0B"'); // 검정 크래커 1색
    expect(master).toContain('rx="116"');
    expect(master).toContain('rotate(-12 256 256)');
    expect((master.match(/<rect /g) ?? []).length).toBe(1);
    expect(master.includes('#FF9900')).toBe(false);
    expect(master.includes('#232F3E')).toBe(false);
  });

  it('마스터는 B안 확정 2x2 큰 구멍 4개다(A안 3x3은 비교 preview 전용)', () => {
    const master = readPublic('branding/moi-cracker.svg').toString('utf8');
    const holes = master.match(/<circle[^>]*fill="#FFFFFF"[^>]*\/>/g) ?? [];
    expect(holes.length).toBe(4);
    expect(master).toContain('r="34"');
  });

  it('마스터에 텍스트·그라데이션·그림자가 없다', () => {
    const master = readPublic('branding/moi-cracker.svg').toString('utf8');
    expect(master.includes('<text')).toBe(false);
    expect(master.includes('linearGradient')).toBe(false);
    expect(master.includes('radialGradient')).toBe(false);
    expect(master.includes('drop-shadow')).toBe(false);
    expect(master.includes('<filter')).toBe(false);
  });

  it('favicon.svg는 마스터와 동일한 아트다', () => {
    expect(readPublic('favicon.svg').equals(readPublic('branding/moi-cracker.svg'))).toBe(true);
  });

  it('mask-icon은 배경 rect 없이 단색 실루엣(currentColor)만 담는다', () => {
    const mask = readPublic('icons/mask-icon.svg').toString('utf8');
    expect(mask.includes('<rect')).toBe(false); // 배경 제거 — Safari 사각형 오류 방지
    expect(mask).toContain('currentColor');
    expect(mask.includes('#FFFFFF')).toBe(false);
    expect(mask.includes('#0B0B0B')).toBe(false);
  });
});

describe('PNG 렌더(검정 비율)', () => {
  const cases = ['icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png'];

  it.each(cases)('%s는 비어있지 않고 검정 비율 0.1~0.5다', (rel) => {
    const { total, dark, ratio } = pngDarkRatio(readPublic(rel));
    expect(total).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(0);
    expect(dark).toBeLessThan(total);
    expect(ratio).toBeGreaterThanOrEqual(0.1);
    expect(ratio).toBeLessThanOrEqual(0.5);
  });
});

describe('maskable 안전원', () => {
  it('maskable-512은 안전원(반지름 205) 밖으로 실루엣이 나가지 않는다', () => {
    const { width, height, rgb } = pngPixels(readPublic('icons/maskable-512.png'));
    expect(width).toBe(512);
    expect(height).toBe(512);
    let darkInside = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = x + 0.5 - 256;
        const dy = y + 0.5 - 256;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const r = rgb[(y * width + x) * 3];
        const g = rgb[(y * width + x) * 3 + 1];
        const b = rgb[(y * width + x) * 3 + 2];
        if (dist > 210) {
          // 안전원+여유 5px 밖은 흰 배경만 허용(앤티앨리어싱 고려 200 임계)
          expect(Math.min(r, g, b), `x=${x} y=${y} dist=${dist.toFixed(1)}`).toBeGreaterThanOrEqual(200);
        } else if (r < 128 && g < 128 && b < 128) {
          darkInside += 1;
        }
      }
    }
    expect(darkInside).toBeGreaterThan(0); // 크래커가 안전원 안에 실제로 렌더된다
  });
});

describe('site.webmanifest', () => {
  it('icon 경로(?v=3)·purpose를 담고 브라우저 크롬색은 기존 잉크를 유지한다', () => {
    const manifest = JSON.parse(readPublic('site.webmanifest').toString('utf8')) as {
      name: string;
      short_name: string;
      description: string;
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
    };
    expect(manifest.name).toBe('moi');
    expect(manifest.short_name).toBe('moi');
    expect(manifest.description).toBe('문제 중심 시험 대비 플랫폼');
    expect(manifest.theme_color).toBe('#232F3E');
    expect(manifest.background_color).toBe('#232F3E');

    for (const icon of manifest.icons) {
      expect(icon.src).toContain('?v=3');
      const rel = icon.src.replace(/^\//, '').replace(/\?.*$/, '');
      expect(existsSync(path.join(publicDir, rel)), icon.src).toBe(true);
      expect(icon.type).toBe('image/png');
      expect(pngDims(readPublic(rel))).toEqual({
        width: Number(icon.sizes.replace('x192', '').replace('x512', '')),
        height: Number(icon.sizes.replace('x192', '').replace('x512', '')),
      });
    }
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable').map((icon) => icon.src)).toEqual([
      '/icons/maskable-192.png?v=3',
      '/icons/maskable-512.png?v=3',
    ]);
  });
});

describe('browserconfig.xml', () => {
  it('mstile 150 타일을 참조하고 타일색은 기존 잉크를 유지한다', () => {
    const xml = readPublic('browserconfig.xml').toString('utf8');
    expect(xml).toContain('src="/icons/mstile-150.png"');
    expect(xml).toContain('<TileColor>#232F3E</TileColor>');
    expect(pngDims(readPublic('icons/mstile-150.png'))).toEqual({ width: 150, height: 150 });
  });
});

describe('index.html 링크', () => {
  const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

  it('icon·apple-touch·mask-icon·manifest에 ?v=3을 쓰고 테마색은 기존 잉크를 유지한다', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml" />');
    expect(html).toContain('<link rel="icon" href="/favicon.ico?v=3" sizes="48x48" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/icon-180.png?v=3" />');
    expect(html).toContain('<link rel="mask-icon" href="/icons/mask-icon.svg?v=3" color="#0B0B0B" />');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest?v=3" />');
    expect(html).toContain('<meta name="theme-color" content="#232F3E" />');
  });
});
