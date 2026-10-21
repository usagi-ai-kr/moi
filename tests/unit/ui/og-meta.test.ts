// #236 OG 공유 카드 — 최초 HTML 정적 meta + 1200×630 이미지 계약 검증.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
const indexHtml = readFileSync(path.join(root, 'index.html'), 'utf8');
const imagePath = path.join(root, 'public', 'og', 'moi-og.png');

function metaContent(html: string, key: string): string | null {
  // property="..." 또는 name="..." 둘 다 지원
  const re = new RegExp(
    `<meta\\s+(?:property|name)=["']${key}["']\\s+content=["']([^"']*)["']`,
    'i',
  );
  const m = html.match(re);
  if (m) return m[1];
  const re2 = new RegExp(
    `<meta\\s+content=["']([^"']*)["']\\s+(?:property|name)=["']${key}["']`,
    'i',
  );
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

describe('OG meta (index.html)', () => {
  it('title이 정적 제목이다', () => {
    expect(indexHtml).toContain('<title>moi - 티끌 moi면 합격</title>');
  });

  it('description meta가 존재한다', () => {
    expect(metaContent(indexHtml, 'description')).toBeTruthy();
  });

  it('OG 필수 태그가 존재한다', () => {
    expect(metaContent(indexHtml, 'og:type')).toBe('website');
    expect(metaContent(indexHtml, 'og:site_name')).toBe('moi');
    expect(metaContent(indexHtml, 'og:title')).toBe('moi - 티끌 moi면 합격');
    expect(metaContent(indexHtml, 'og:description')).toBeTruthy();
    expect(metaContent(indexHtml, 'og:url')).toBe('https://moi.qus0in.workers.dev/');
    expect(metaContent(indexHtml, 'og:image')).toBe('https://moi.qus0in.workers.dev/og/moi-og.png');
    expect(metaContent(indexHtml, 'og:image:width')).toBe('1200');
    expect(metaContent(indexHtml, 'og:image:height')).toBe('630');
    expect(metaContent(indexHtml, 'og:image:alt')).toBeTruthy();
    expect(metaContent(indexHtml, 'og:locale')).toBe('ko_KR');
  });

  it('X summary_large_image 카드 태그가 존재한다', () => {
    expect(metaContent(indexHtml, 'twitter:card')).toBe('summary_large_image');
    expect(metaContent(indexHtml, 'twitter:title')).toBe('moi - 티끌 moi면 합격');
    expect(metaContent(indexHtml, 'twitter:description')).toBeTruthy();
    expect(metaContent(indexHtml, 'twitter:image')).toBe('https://moi.qus0in.workers.dev/og/moi-og.png');
    expect(metaContent(indexHtml, 'twitter:image:alt')).toBeTruthy();
  });

  it('확인되지 않은 twitter:site/creator는 없다', () => {
    expect(indexHtml).not.toMatch(/twitter:site/);
    expect(indexHtml).not.toMatch(/twitter:creator/);
  });

  it('내부 UUID/식별자가 meta에 없다', () => {
    // UUID v4 패턴
    expect(indexHtml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe('OG image', () => {
  it('파일이 존재한다', () => {
    expect(existsSync(imagePath)).toBe(true);
  });

  it('PNG 1200×630, 5MB 미만이다', () => {
    const buf = readFileSync(imagePath);
    expect(buf.length).toBeLessThan(5 * 1024 * 1024);
    // PNG signature
    expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
  });
});
