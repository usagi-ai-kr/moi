#!/usr/bin/env node
// #134 콘텐츠 작성 계약 검증기·bulk 변환기. 외부 패키지 없이 Node ESM만 사용.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_SOURCE_PREFIX = 'https://docs.aws.amazon.com/';
export const SAA_DOMAIN_CODES = ['security', 'resilience', 'performance', 'cost-optimization'];
export const ALLOWED_EXAM_CODES = ['saa-c03'];
export const MAX_EXPLANATION_LENGTH = 8000;
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

// #308 — 지시문(고르기)의 요구 개수와 정답 개수(answerOptionKeys) 불일치 검사.
// UI 판정은 정답 개수 메타데이터만 본다(지시문 파싱 금지) — 여기서는 **콘텐츠 데이터 검증** 전용이다.
const CHOOSE_INSTRUCTIONS = ['고르시오', '고르세요', '고르십시오', '선택하시오', '선택하세요', '선택하십시오'];
// 개수 표현은 고르기 지시문 바로 앞 24자 안에서만 읽는다("5개의 버킷" 같은 수식어 오판 방지).
const CHOOSE_COUNT_WINDOW = 24;
const KOREAN_CHOOSE_COUNTS = [
  ['한 가지', 1],
  ['두 가지', 2],
  ['세 가지', 3],
  ['네 가지', 4],
  ['하나', 1],
  ['둘', 2],
  ['셋', 3],
  ['넷', 4],
];

/** 고르기 지시문 직전 구간에서 요구 개수를 읽는다. 없으면 null(검사 대상 아님). */
function parseChooseCount(window) {
  for (const [word, count] of KOREAN_CHOOSE_COUNTS) {
    if (window.includes(word)) return count;
  }
  const arabic = /(\d+)\s*개/.exec(window);
  if (arabic) {
    const value = Number.parseInt(arabic[1], 10);
    if (Number.isInteger(value)) return value;
  }
  return null;
}

/**
 * 지시문 요구 개수와 정답 개수 불일치 판정(#308).
 * - 불일치 시 결정적 문구를 반환(예: 'stem: choose-count mismatch (asks 1, answers 2)'), 일치·무표현이면 null.
 */
export function chooseCountMismatch(stem, answerCount) {
  const text = String(stem ?? '');
  const answers = Number(answerCount);
  if (!Number.isInteger(answers) || answers < 0) return null;
  for (const instruction of CHOOSE_INSTRUCTIONS) {
    const index = text.indexOf(instruction);
    if (index === -1) continue;
    const window = text.slice(Math.max(0, index - CHOOSE_COUNT_WINDOW), index);
    const asked = parseChooseCount(window);
    if (asked === null) continue;
    if (asked === answers) return null;
    return `stem: choose-count mismatch (asks ${asked}, answers ${answers})`;
  }
  return null;
}

function fail(list, file, questionId, message) {
  list.push({ file, questionId: questionId ?? '', message });
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** 원시 HTML·스크립트 금지(#134 계약): `<script` 또는 `javascript:`가 있으면 오류 메시지. */
export function unsafeMarkupError(value) {
  const lower = String(value).toLowerCase();
  if (lower.includes('<script')) return 'raw HTML/script is not allowed (<script)';
  if (lower.includes('javascript:')) return 'raw HTML/script is not allowed (javascript:)';
  return null;
}

/**
 * 펜스 코드 블록 균형 검사(#134). 열린 ```가 끝까지 닫히지 않으면 오류 메시지.
 * ` ```mermaid ` 블록도 같은 규칙으로 닫힘이 필수다.
 */
export function fenceBalanceError(value) {
  let openMarker = null;
  for (const line of String(value).split('\n')) {
    const match = /^\s{0,3}(`{3,})[^`]*$/.exec(line);
    if (!match) continue;
    const marker = match[1];
    if (openMarker === null) {
      openMarker = marker;
    } else if (marker.length >= openMarker.length) {
      openMarker = null;
    }
  }
  return openMarker === null ? null : 'unbalanced code fence: ``` block must be closed';
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
    else {
      const unsafe = unsafeMarkupError(item.stem);
      if (unsafe) fail(errors, file, qid, `${where}.stem: ${unsafe}`);
    }
    if (!isNonEmptyString(item?.explanation)) fail(errors, file, qid, `${where}.explanation must not be empty`);
    else {
      if (item.explanation.length > MAX_EXPLANATION_LENGTH) {
        fail(errors, file, qid, `${where}.explanation must be at most ${MAX_EXPLANATION_LENGTH} characters`);
      }
      const unsafe = unsafeMarkupError(item.explanation);
      if (unsafe) fail(errors, file, qid, `${where}.explanation: ${unsafe}`);
      const fence = fenceBalanceError(item.explanation);
      if (fence) fail(errors, file, qid, `${where}.explanation: ${fence}`);
    }
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
      // #308 — 지시문(고르기)이 요구하는 개수와 정답 개수가 다르면 단일/복수 계약이 어긋난다.
      if (isNonEmptyString(item?.stem)) {
        const mismatch = chooseCountMismatch(item.stem, answers.length);
        if (mismatch) fail(errors, file, qid, `${where}.${mismatch}`);
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
