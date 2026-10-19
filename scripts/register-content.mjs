#!/usr/bin/env node
// #134 content/questions/<exam>/*.json 팩을 관리 API bulk로 등록한다.
// - 토큰은 MOI_ADMIN_TOKEN 환경변수에서만 읽고 출력하지 않는다.
// - 예시 팩(sample-pack.json)은 수업 등록 대상에서 제외한다.
// - 100개 이하 청크 + 청크별 Idempotency-Key로 재실행을 안전하게 한다.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPackFiles, toBulkBody, validatePack } from './validate-question-content.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_DIR = 'content/questions/saa-c03';
const MAX_CHUNK = 100;
const USAGE =
  'usage: node scripts/register-content.mjs --url <baseUrl> [--dir <path>] [--chunk 100] [--dry-run]';

export function isSamplePack(file) {
  return basename(file) === 'sample-pack.json';
}

export function filterPackFiles(files) {
  return files.filter((file) => !isSamplePack(file));
}

export function selectPackFiles(dir) {
  return filterPackFiles(collectPackFiles(dir));
}

export function loadPacks(files) {
  return files.map((file) => ({ file, pack: JSON.parse(readFileSync(file, 'utf8')) }));
}

/** 검증기를 통과한 팩들을 bulkBodySchema와 동일한 `{ items }`로 변환한다. */
export function buildBulkPayload(packs) {
  return toBulkBody(packs);
}

export function chunkItems(items, size = MAX_CHUNK) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_CHUNK) {
    throw new RangeError(`chunk size must be 1..${MAX_CHUNK}`);
  }
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function idempotencyKey(index, items) {
  const hash = createHash('sha256').update(JSON.stringify(items), 'utf8').digest('hex');
  return `content-${index}-${hash}`;
}

export function domainDistribution(items) {
  const out = {};
  for (const item of items) out[item.domainCode] = (out[item.domainCode] ?? 0) + 1;
  return out;
}

function parseArgs(argv) {
  const out = { url: null, dir: DEFAULT_DIR, chunk: MAX_CHUNK, dryRun: false, error: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--url' || arg === '--dir' || arg === '--chunk') {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined || value.startsWith('--')) {
        return { ...out, error: `${arg} 값이 필요합니다.` };
      }
      if (arg === '--url') out.url = value;
      else if (arg === '--dir') out.dir = value;
      else out.chunk = Number(value);
    } else if (arg.startsWith('--url=')) {
      out.url = arg.slice('--url='.length);
    } else if (arg.startsWith('--dir=')) {
      out.dir = arg.slice('--dir='.length);
    } else if (arg.startsWith('--chunk=')) {
      out.chunk = Number(arg.slice('--chunk='.length));
    } else {
      return { ...out, error: '알 수 없는 인자입니다.' };
    }
  }
  if (!Number.isInteger(out.chunk) || out.chunk < 1 || out.chunk > MAX_CHUNK) {
    return { ...out, error: `--chunk는 1~${MAX_CHUNK} 사이의 정수여야 합니다.` };
  }
  if (!out.dryRun && !out.url) return { ...out, error: '--url이 필요합니다(--dry-run 제외).' };
  if (out.url) {
    let parsed;
    try {
      parsed = new URL(out.url);
    } catch {
      return { ...out, error: '--url 형식이 올바르지 않습니다.' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ...out, error: '--url은 http(s)여야 합니다.' };
    }
  }
  return out;
}

function readPacks(dir) {
  let files;
  try {
    files = selectPackFiles(dir);
  } catch {
    return { error: `콘텐츠 디렉터리를 찾을 수 없습니다: ${dir}` };
  }
  const packs = [];
  for (const file of files) {
    try {
      packs.push({ file, pack: JSON.parse(readFileSync(file, 'utf8')) });
    } catch {
      return { error: `JSON 파싱 실패: ${basename(file)}` };
    }
  }
  return { packs };
}

function validateAll(packs) {
  const seen = { ids: new Map(), stems: new Map() };
  const problems = [];
  for (const { pack, file } of packs) problems.push(...validatePack(pack, file, seen));
  return problems;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(USAGE);
    console.error(args.error);
    process.exitCode = 2;
    return;
  }

  const token = process.env.MOI_ADMIN_TOKEN?.trim();
  if (!args.dryRun && !token) {
    console.error(USAGE);
    console.error('MOI_ADMIN_TOKEN 환경변수가 필요합니다.');
    process.exitCode = 2;
    return;
  }

  const loaded = readPacks(resolve(ROOT, args.dir));
  if (loaded.error) {
    console.error(loaded.error);
    process.exitCode = 1;
    return;
  }
  const problems = validateAll(loaded.packs);
  if (problems.length > 0) {
    for (const p of problems.slice(0, 20)) {
      console.error(`${basename(p.file)} :: ${p.questionId || '(pack)'} :: ${p.message}`);
    }
    console.error(`검증 실패: ${problems.length}건`);
    process.exitCode = 1;
    return;
  }

  const { items } = buildBulkPayload(loaded.packs);
  const chunks = chunkItems(items, args.chunk);
  if (args.dryRun) {
    console.log(`questions: ${items.length}`);
    console.log(`chunks: ${chunks.length}`);
    console.log(`domains: ${JSON.stringify(domainDistribution(items))}`);
    console.log('network: skipped (dry-run)');
    return;
  }
  if (items.length === 0) {
    console.error('등록할 문항이 없습니다(sample-pack은 제외됩니다).');
    process.exitCode = 1;
    return;
  }

  const endpoint = `${args.url.replace(/\/+$/, '')}/api/admin/questions/bulk`;
  const startedAt = Date.now();
  let registered = 0;
  for (const [index, chunk] of chunks.entries()) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey(index + 1, chunk),
        },
        body: JSON.stringify({ items: chunk }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      console.error(`chunk ${index + 1}/${chunks.length}: network error`);
      process.exitCode = 1;
      return;
    }

    if (response.status !== 201) {
      const body = await response.json().catch(() => null);
      const error = typeof body?.error === 'string' ? body.error : 'unknown';
      console.error(`chunk ${index + 1}/${chunks.length}: HTTP ${response.status} error=${error}`);
      process.exitCode = 1;
      return;
    }

    const body = await response.json().catch(() => null);
    registered += Array.isArray(body?.created) ? body.created.length : chunk.length;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`chunks: ${chunks.length}`);
  console.log(`registered: ${registered}`);
  console.log('failed: 0');
  console.log(`elapsed: ${elapsed}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('등록 실패');
    process.exitCode = 1;
  });
}
