#!/usr/bin/env node
// #329: stable content questionId → normalized stem fingerprint → reviewed concept tag.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const QUESTIONS_DIR = join(ROOT, 'content/questions/saa-c03');
const CATALOG_PATH = join(ROOT, 'content/concepts/saa-c03/catalog.json');
const OUTPUT_PATH = join(ROOT, 'content/concepts/saa-c03/question-index.json');

export function normalizeConceptStem(stem) {
  return String(stem).trim().replace(/\s+/g, ' ').toLowerCase();
}

function listPacks(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== 'sample-pack.json')
    .sort()
    .map((file) => ({ file, pack: JSON.parse(readFileSync(join(dir, file), 'utf8')) }));
}

export function buildConceptQuestionIndex(packs, catalog) {
  if (!catalog || typeof catalog.examCode !== 'string' || !Array.isArray(catalog.concepts)) {
    throw new Error('개념 카탈로그 형식이 올바르지 않습니다.');
  }
  const byPack = new Map();
  const conceptIds = new Set();
  for (const concept of catalog.concepts) {
    if (!concept?.id || !concept?.packId || !concept?.title) throw new Error('개념 문서에 id, packId, title이 필요합니다.');
    if (conceptIds.has(concept.id)) throw new Error(`개념 id 중복: ${concept.id}`);
    if (catalog.concepts.filter((candidate) => candidate.packId === concept.packId).length > 1) {
      throw new Error(`문제 팩에 연결된 개념이 중복됩니다: ${concept.packId}`);
    }
    conceptIds.add(concept.id);
    if (
      concept.reviewStatus !== 'reviewed' ||
      typeof concept.reviewedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(concept.reviewedAt) ||
      Number.isNaN(Date.parse(concept.reviewedAt))
    ) continue;
    if (!concept.summary || !Array.isArray(concept.confusions) || concept.confusions.length === 0) {
      throw new Error(`개념 문서에 요약과 혼동 비교가 필요합니다: ${concept.id}`);
    }
    if (!Array.isArray(concept.sourceUrls) || concept.sourceUrls.length === 0 || concept.sourceUrls.some((url) => !url.startsWith('https://docs.aws.amazon.com/'))) {
      throw new Error(`공식 AWS 출처가 필요합니다: ${concept.id}`);
    }
    byPack.set(concept.packId, concept);
  }

  const output = {};
  const sourceIds = new Set();
  for (const { pack } of packs) {
    const concept = byPack.get(pack.packId);
    if (!concept) continue; // 검수된 문서가 없는 문제는 인덱스에 넣지 않아 추천 근거를 차단한다.
    if (pack.examCode !== catalog.examCode) throw new Error(`시험 코드 불일치: ${pack.packId}`);
    for (const item of pack.items ?? []) {
      if (!item.questionId || !item.stem || !item.domainCode) throw new Error(`문항 필드 누락: ${pack.packId}`);
      if (sourceIds.has(item.questionId)) throw new Error(`문항 ID 중복: ${item.questionId}`);
      sourceIds.add(item.questionId);
      const stemHash = createHash('sha256').update(normalizeConceptStem(item.stem), 'utf8').digest('hex');
      if (output[stemHash]) throw new Error(`문항 stem fingerprint 충돌: ${item.questionId}`);
      output[stemHash] = {
        sourceQuestionId: item.questionId,
        examCode: pack.examCode,
        domainCode: item.domainCode,
        conceptId: concept.id,
      };
    }
  }
  for (const concept of catalog.concepts) {
    if (!packs.some(({ pack }) => pack.packId === concept.packId)) throw new Error(`문제 팩이 없는 개념 문서: ${concept.id}`);
  }
  return Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b)));
}

function render(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check')) throw new Error('usage: node scripts/generate-concept-question-index.mjs [--check]');
  const current = render(buildConceptQuestionIndex(listPacks(QUESTIONS_DIR), JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))));
  if (args.includes('--check')) {
    let checked;
    try {
      checked = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
      throw new Error('생성된 개념 문항 인덱스가 없습니다. 생성 스크립트를 실행하세요.');
    }
    if (checked !== current) throw new Error('개념 문항 인덱스가 문제 팩/카탈로그와 다릅니다. 다시 생성하세요.');
    console.log(`OK: ${Object.keys(JSON.parse(current)).length}개 문항 fingerprint 일치`);
    return;
  }
  writeFileSync(OUTPUT_PATH, current);
  console.log(`생성: ${resolve(OUTPUT_PATH)} (${Object.keys(JSON.parse(current)).length}개 문항)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : '개념 인덱스 생성 실패');
    process.exitCode = 1;
  }
}
