#!/usr/bin/env node
// 환영 문구 32종 삽화 생성 (이슈 #305, ADR-0089 예정).
// 사용법: node scripts/generate-welcome-illustrations.mjs [--sample]
// 환경: .env 의 GEMINI_API_KEY (값은 출력하지 않는다).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MODEL = 'gemini-nano-banana-2.1';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv();

const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
if (!apiKey) {
  console.error('GEMINI_API_KEY 가 .env 에 없습니다 (exit 2)');
  process.exit(2);
}

// 카피 원문은 src/ui/greetings.ts 의 단일 소스에서 읽는다.
const greetingsPath = join(ROOT, 'src/ui/greetings.ts');
const greetingsSrc = readFileSync(greetingsPath, 'utf8');
const re = /\{\s*id:\s*'(g\d{2})',\s*text:\s*'([^']+)'\s*\}/g;
const greetings = [];
let m;
while ((m = re.exec(greetingsSrc)) !== null) greetings.push({ id: m[1], text: m[2] });
if (greetings.length !== 32) {
  console.error(`greeting 수가 32가 아닙니다: ${greetings.length}`);
  process.exit(1);
}

const sampleOnly = process.argv.includes('--sample');
const targets = sampleOnly ? greetings.slice(0, 4) : greetings;

const outDir = join(ROOT, 'public', 'welcome');
mkdirSync(outDir, { recursive: true });

const styleGuide =
  'Warm, friendly, minimal illustration for a Korean exam-prep app called moi. ' +
  'Soft pastel palette, rounded shapes, no text, no letters, no words, no watermark. ' +
  'Square 1:1, clean background, welcoming mood.';

async function generateOne(g) {
  const webpPath = join(outDir, `${g.id}.webp`);
  if (existsSync(webpPath)) {
    console.log(`skip ${g.id} (exists)`);
    return;
  }
  const prompt = `${styleGuide} Illustration concept inspired by the greeting "${g.text}" (do not render the text).`;
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  const inline = part?.inlineData || part?.inline_data;
  if (!inline?.data) throw new Error('이미지 데이터 없음');
  const buf = Buffer.from(inline.data, 'base64');
  const pngPath = join(outDir, `${g.id}.png`);
  writeFileSync(pngPath, buf);
  execFileSync('cwebp', ['-q', '80', pngPath, '-o', webpPath], { stdio: 'ignore' });
  // png 임시 파일 제거
  try { (await import('node:fs')).unlinkSync(pngPath); } catch {}
  console.log(`generated ${g.id}`);
}

for (const g of targets) {
  try {
    await generateOne(g);
  } catch (e) {
    console.error(`FAIL ${g.id}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1200));
}

// 매핑 파일 생성(전체 32개 기준, 샘플 모드에서도 전체 매핑 유지)
const mapping = greetings.map((g) => ({
  id: g.id,
  imagePath: `/welcome/${g.id}.webp`,
  alt: `환영 일러스트: ${g.text}`,
}));
const mappingSrc = `// 환영 삽화 매핑 — 단일 소스 (이슈 #305).
// imagePath 는 public/welcome/ 기준 URL 경로.
export type WelcomeIllustration = { id: string; imagePath: string; alt: string };

export const WELCOME_ILLUSTRATIONS: readonly WelcomeIllustration[] = ${JSON.stringify(mapping, null, 2)} as const;

export function findWelcomeIllustration(id: string): WelcomeIllustration | undefined {
  return WELCOME_ILLUSTRATIONS.find((w) => w.id === id);
}
`;
writeFileSync(join(ROOT, 'src/ui/welcome-illustrations.ts'), mappingSrc, 'utf8');
console.log(`mapping written (${mapping.length})`);