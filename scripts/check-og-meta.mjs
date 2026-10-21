// scripts/check-og-meta.mjs — OG meta/이미지 정적 검증 (CI 친화)
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const img = path.join(root, 'public', 'og', 'moi-og.png');

function meta(key) {
  const re = new RegExp(`<meta\\s+(?:property|name)=["']${key}["']\\s+content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  if (m) return m[1];
  const re2 = new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+(?:property|name)=["']${key}["']`, 'i');
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

const checks = [];
const ok = (name, cond) => { checks.push({ name, ok: !!cond }); if (!cond) console.error(`FAIL: ${name}`); };

ok('title', html.includes('<title>moi - 티끌 moi면 합격</title>'));
ok('og:type', meta('og:type') === 'website');
ok('og:site_name', meta('og:site_name') === 'moi');
ok('og:title', meta('og:title') === 'moi - 티끌 moi면 합격');
ok('og:description', !!meta('og:description'));
ok('og:url', meta('og:url') === 'https://moi.qus0in.workers.dev/');
ok('og:image', meta('og:image') === 'https://moi.qus0in.workers.dev/og/moi-og.png');
ok('og:image:width', meta('og:image:width') === '1200');
ok('og:image:height', meta('og:image:height') === '630');
ok('og:image:alt', !!meta('og:image:alt'));
ok('og:locale', meta('og:locale') === 'ko_KR');
ok('twitter:card', meta('twitter:card') === 'summary_large_image');
ok('twitter:title', meta('twitter:title') === 'moi - 티끌 moi면 합격');
ok('twitter:description', !!meta('twitter:description'));
ok('twitter:image', meta('twitter:image') === 'https://moi.qus0in.workers.dev/og/moi-og.png');
ok('twitter:image:alt', !!meta('twitter:image:alt'));
ok('no twitter:site', !/twitter:site/.test(html));
ok('no twitter:creator', !/twitter:creator/.test(html));
ok('no UUID in html', !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(html));
ok('image exists', existsSync(img));

if (existsSync(img)) {
  const buf = readFileSync(img);
  ok('image <5MB', buf.length < 5 * 1024 * 1024);
  ok('image png signature', buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  ok('image width 1200', buf.readUInt32BE(16) === 1200);
  ok('image height 630', buf.readUInt32BE(20) === 630);
  console.log(`image size: ${buf.length} bytes, ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`OG check: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
