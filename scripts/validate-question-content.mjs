#!/usr/bin/env node
// #134 콘텐츠 작성 계약 검증기·bulk 변환기. 외부 패키지 없이 Node ESM만 사용.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_SOURCE_PREFIX = 'https://docs.aws.amazon.com/';
export const SAA_DOMAIN_CODES = ['security', 'resilience', 'performance', 'cost-optimization'];
export const ALLOWED_EXAM_CODES = ['saa-c03'];
export const BULK_FIELDS = [
  'examCode',
  'domainCode',
  'stem',
  'explanation',
  'sourceUrls',
  'answerOptionKeys',
  'optionSetHash',
  'options',
];

export function normalizeStem(stem) {
  return String(stem).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function sortedOptions(options) {
  return [...options].sort((a, b) => String(a.optionKey).localeCompare(String(b.optionKey)));
}

export function optionSetHash(options) {
  const canonical = JSON.stringify(sortedOptions(options));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function fail(list, file, questionId, message) {
  list.push({ file, questionId: questionId ?? '', message });
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// 단일 팩 검증. seen은 팩 간 중복 추적용(호출자가 유지).
export function validatePack(pack, file, seen = { ids: new Map(), stems: new Map() }) {
  const errors = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    fail(errors, file, '', 'pack must be a JSON object');
    return errors;
  }
  if (!isNonEmptyString(pack.packId)) fail(errors, file, '', 'packId is required');
  if (!isNonEmptyString(pack.examCode)) fail(errors, file, '', 'examCode is required');
  else if (!ALLOWED_EXAM_CODES.includes(pack.examCode)) {
    fail(errors, file, '', `unknown examCode ${pack.examCode}`);
  }
  if (!Array.isArray(pack.items) || pack.items.length === 0) {
    fail(errors, file, '', 'items must be a non-empty array');
    return errors;
  }
  const localIds = new Set();
  const localStems = new Set();
  for (const [index, item] of pack.items.entries()) {
    const qid = typeof item?.questionId === 'string' ? item.questionId : '';
    const where = `items[${index}]`;
    if (!isNonEmptyString(item?.questionId)) fail(errors, file, qid, `${where}.questionId is required`);
    if (!isNonEmptyString(item?.domainCode)) fail(errors, file, qid, `${where}.domainCode is required`);
    else if (!SAA_DOMAIN_CODES.includes(item.domainCode)) {
      fail(errors, file, qid, `${where}.unknown domainCode ${item.domainCode}`);
    }
    if (!isNonEmptyString(item?.stem)) fail(errors, file, qid, `${where}.stem must not be empty`);
    if (!isNonEmptyString(item?.explanation)) fail(errors, file, qid, `${where}.explanation must not be empty`);
    if (!Array.isArray(item?.sourceUrls) || item.sourceUrls.length === 0) {
      fail(errors, file, qid, `${where}.sourceUrls must have at least 1 url`);
    } else {
      for (const url of item.sourceUrls) {
        if (typeof url !== 'string' || !url.startsWith(ALLOWED_SOURCE_PREFIX)) {
          fail(errors, file, qid, `${where}.sourceUrls only allows ${ALLOWED_SOURCE_PREFIX}`);
          break;
        }
      }
    }
    const options = item?.options;
    let optionKeys = [];
    if (!Array.isArray(options) || options.length < 2 || options.length > 20) {
      fail(errors, file, qid, `${where}.options must have 2~20 entries`);
    } else {
      const keys = new Set();
      for (const [oi, opt] of options.entries()) {
        if (!isNonEmptyString(opt?.optionKey) || !isNonEmptyString(opt?.text)) {
          fail(errors, file, qid, `${where}.options[${oi}] needs optionKey and text`);
        } else if (keys.has(opt.optionKey)) {
          fail(errors, file, qid, `${where}.options has duplicate optionKey ${opt.optionKey}`);
        } else {
          keys.add(opt.optionKey);
        }
      }
      optionKeys = [...keys];
    }
    const answers = item?.answerOptionKeys;
    if (!Array.isArray(answers) || answers.length === 0) {
      fail(errors, file, qid, `${where}.answerOptionKeys must have at least 1 key`);
    } else {
      if (new Set(answers).size !== answers.length) {
        fail(errors, file, qid, `${where}.answerOptionKeys has duplicates`);
      }
      const keySet = new Set(optionKeys);
      for (const key of answers) {
        if (!keySet.has(key)) {
          fail(errors, file, qid, `${where}.answerOptionKeys has unknown key ${key}`);
          break;
        }
      }
    }
    if (qid) {
      if (localIds.has(qid)) fail(errors, file, qid, `duplicate questionId ${qid} in pack`);
      else localIds.add(qid);
      if (seen.ids.has(qid)) fail(errors, file, qid, `duplicate questionId ${qid} across packs`);
      else seen.ids.set(qid, file);
    }
    if (isNonEmptyString(item?.stem)) {
      const norm = normalizeStem(item.stem);
      if (localStems.has(norm)) fail(errors, file, qid, 'duplicate stem in pack (normalized)');
      else localStems.add(norm);
      if (seen.stems.has(norm)) fail(errors, file, qid, 'duplicate stem across packs (normalized)');
      else seen.stems.set(norm, file);
    }
  }
  return errors;
}

export function collectPackFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json')) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

export function toBulkBody(packs) {
  const items = [];
  for (const { pack } of packs) {
    for (const item of pack.items) {
      items.push({
        examCode: pack.examCode,
        domainCode: item.domainCode,
        stem: item.stem,
        explanation: item.explanation,
        sourceUrls: item.sourceUrls,
        answerOptionKeys: item.answerOptionKeys,
        optionSetHash: optionSetHash(item.options),
        options: item.options,
      });
    }
  }
  return { items };
}

function parseArgs(argv) {
  let root = null;
  let emit = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--emit') {
      emit = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith('--emit=')) {
      emit = arg.slice('--emit='.length);
    } else if (!arg.startsWith('-') && root === null) {
      root = arg;
    }
  }
  return { root, emit };
}

function main() {
  const { root, emit } = parseArgs(process.argv.slice(2));
  if (!root) {
    console.error('usage: node scripts/validate-question-content.mjs content/questions [--emit <out.json>]');
    process.exit(1);
  }
  let files = [];
  try {
    files = collectPackFiles(root);
  } catch {
    console.error(`content root not found: ${root}`);
    process.exit(1);
  }
  const packs = [];
  const errors = [];
  for (const file of files) {
    let parsed = null;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      fail(errors, file, '', `JSON parse failed: ${e.message}`);
      continue;
    }
    packs.push({ pack: parsed, file });
  }
  const seen = { ids: new Map(), stems: new Map() };
  for (const { pack, file } of packs) errors.push(...validatePack(pack, file, seen));
  if (errors.length > 0) {
    for (const e of errors) console.error(`${e.file} :: ${e.questionId || '(pack)'} :: ${e.message}`);
    console.error(`FAILED: ${errors.length} problem(s) in ${files.length} pack file(s)`);
    process.exit(1);
  }
  if (emit) writeFileSync(emit, `${JSON.stringify(toBulkBody(packs), null, 2)}\n`, 'utf8');
  const domains = {};
  let questions = 0;
  for (const { pack } of packs) {
    for (const item of pack.items) {
      questions += 1;
      domains[item.domainCode] = (domains[item.domainCode] ?? 0) + 1;
    }
  }
  console.log(`OK: packs=${packs.length} questions=${questions} domains=${JSON.stringify(domains)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
