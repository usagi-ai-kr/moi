// #70 favicon·OS 아이콘 자산 검증 — 파생 자산 존재·치수·컨테이너 구조·마스터 규칙.
// 새로운 의존성 없이 Node Buffer로 PNG IHDR과 ICO 컨테이너를 직접 파싱한다.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const publicDir = path.resolve(__dirname, '../../public');

const readPublic = (rel: string) => readFileSync(path.join(publicDir, rel));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngDims(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(buffer.readUInt32BE(8)).toBe(13); // IHDR 길이
  expect(buffer.toString('ascii', 12, 16)).toBe('IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('아이콘 자산 존재', () => {
  const required = [
    'branding/moi-bird.svg',
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
  it('마스터는 직접 작성한 정사각 viewBox·AWS Orange/잉크 팔레트를 쓴다', () => {
    const master = readPublic('branding/moi-bird.svg').toString('utf8');
    expect(master).toContain('viewBox="0 0 512 512"');
    expect(master).toContain('fill="#FF9900"'); // AWS Orange
    expect(master).toContain('fill="#232F3E"'); // ink
    expect((master.match(/<rect /g) ?? []).length).toBe(1);
  });

  it('favicon.svg는 마스터와 동일한 아트다', () => {
    expect(readPublic('favicon.svg').equals(readPublic('branding/moi-bird.svg'))).toBe(true);
  });

  it('mask-icon은 배경 rect 없이 단색 실루엣(currentColor)만 담는다', () => {
    const mask = readPublic('icons/mask-icon.svg').toString('utf8');
    expect(mask.includes('<rect')).toBe(false); // 배경 제거 — Safari 사각형 오류 방지
    expect(mask).toContain('currentColor');
    expect(mask.includes('#FF9900')).toBe(false);
    expect(mask.includes('#232F3E')).toBe(false);
  });
});

describe('site.webmanifest', () => {
  it('icon 경로·purpose·색·간결한 이름을 담는다', () => {
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
      const rel = icon.src.replace(/^\//, '');
      expect(existsSync(path.join(publicDir, rel)), icon.src).toBe(true);
      expect(icon.type).toBe('image/png');
      expect(pngDims(readPublic(rel))).toEqual({
        width: Number(icon.sizes.replace('x192', '').replace('x512', '')),
        height: Number(icon.sizes.replace('x192', '').replace('x512', '')),
      });
    }
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable').map((icon) => icon.src)).toEqual([
      '/icons/maskable-192.png',
      '/icons/maskable-512.png',
    ]);
  });
});

describe('browserconfig.xml', () => {
  it('mstile 150 타일과 잉크 타일색을 참조한다', () => {
    const xml = readPublic('browserconfig.xml').toString('utf8');
    expect(xml).toContain('src="/icons/mstile-150.png"');
    expect(xml).toContain('<TileColor>#232F3E</TileColor>');
    expect(pngDims(readPublic('icons/mstile-150.png'))).toEqual({ width: 150, height: 150 });
  });
});

describe('index.html 링크', () => {
  const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

  it('icon·apple-touch·mask-icon·manifest·theme-color만 아이콘 관련으로 추가된다', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/icon-180.png" />');
    expect(html).toContain('<link rel="mask-icon" href="/icons/mask-icon.svg" color="#FF9900" />');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(html).toContain('<meta name="theme-color" content="#232F3E" />');
  });
});
