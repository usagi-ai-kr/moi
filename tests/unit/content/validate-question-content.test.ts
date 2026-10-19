// #134 콘텐츠 작성 계약 검증기 단위 테스트 (Given/When/Then, Red→Green)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BULK_FIELDS,
  optionSetHash,
  toBulkBody,
  validatePack,
} from '../../../scripts/validate-question-content.mjs';

const VALIDATOR = fileURLToPath(new URL('../../../scripts/validate-question-content.mjs', import.meta.url));
const SAMPLE_PACK = fileURLToPath(
  new URL('../../../content/questions/saa-c03/sample-pack.json', import.meta.url),
);

function validItem(overrides = {}) {
  return {
    questionId: 'saa-sample-0001',
    domainCode: 'security',
    stem: '예시 줄기 문장이다.',
    explanation: '예시 해설이다.',
    sourceUrls: ['https://docs.aws.amazon.com/ec2/index.html'],
    answerOptionKeys: ['B'],
    options: [
      { optionKey: 'A', text: '보기 A' },
      { optionKey: 'B', text: '보기 B' },
    ],
    ...overrides,
  };
}

function validPack(overrides = {}) {
  return { packId: 'p1', examCode: 'saa-c03', items: [validItem()], ...overrides };
}

function writeTempPack(pack: object) {
  const dir = mkdtempSync(join(tmpdir(), 'qpack-'));
  const file = join(dir, 'pack.json');
  writeFileSync(file, JSON.stringify(pack), 'utf8');
  return { dir, file };
}

describe('Given 작성 계약 / When 검증기 호출 / Then AC 충족', () => {
  it('정상 팩은 통과하고 emit은 bulk payload 형태이며 questionId를 제거한다', () => {
    expect(validatePack(validPack(), 'pack.json')).toEqual([]);
    const bulk = toBulkBody([{ pack: validPack(), file: 'pack.json' }]);
    expect(Object.keys(bulk.items[0] ?? {}).sort()).toEqual([...BULK_FIELDS].sort());
    expect(bulk.items[0]).not.toHaveProperty('questionId');
    expect(typeof bulk.items[0]?.optionSetHash).toBe('string');
  });

  it('optionSetHash는 옵션 정렬 canonical JSON의 SHA-256 hex이다', () => {
    const a = validItem().options;
    const shuffled = [...a].reverse();
    expect(optionSetHash(a)).toBe(optionSetHash(shuffled));
    expect(optionSetHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('팩 내부 중복 questionId와 정규화 stem 중복은 실패한다', () => {
    const dupId = validPack({
      items: [validItem(), { ...validItem(), domainCode: 'resilience', stem: '다른 줄기다.' }],
    });
    expect(validatePack(dupId, 'dup.json').some((e: { message: string }) => e.message.includes('duplicate questionId'))).toBe(true);
    const dupStem = validPack({
      items: [
        validItem({ questionId: 'q-1' }),
        validItem({ questionId: 'q-2', stem: '  예시   줄기 문장이다. ' }),
      ],
    });
    expect(validatePack(dupStem, 'stem.json').some((e: { message: string }) => e.message.includes('duplicate stem'))).toBe(true);
  });

  it('정답 키 불일치와 비공식 URL은 실패한다', () => {
    const badKey = validPack({ items: [validItem({ answerOptionKeys: ['Z'] })] });
    expect(
      validatePack(badKey, 'key.json').some((e: { message: string }) => e.message.includes('unknown key')),
    ).toBe(true);
    const badUrl = validPack({ items: [validItem({ sourceUrls: ['https://example.com/x'] })] });
    expect(validatePack(badUrl, 'url.json').some((e: { message: string }) => e.message.includes('sourceUrls'))).toBe(true);
  });

  it('잘못된 domainCode는 거부한다(정본 4개만 허용)', () => {
    const badDomain = validPack({ items: [validItem({ domainCode: 'resilient' })] });
    expect(
      validatePack(badDomain, 'domain.json').some((e: { message: string }) => e.message.includes('unknown domainCode')),
    ).toBe(true);
  });

  it('실제 예시 팩 4문항을 읽어 검증기가 통과한다(CLI 포함)', () => {
    const parsed = JSON.parse(readFileSync(SAMPLE_PACK, 'utf8'));
    expect(parsed.items).toHaveLength(4);
    expect(new Set(parsed.items.map((i: { domainCode: string }) => i.domainCode)).size).toBe(4);
    expect(validatePack(parsed, SAMPLE_PACK)).toEqual([]);
    const { dir } = writeTempPack(parsed);
    const out = execFileSync('node', [VALIDATOR, dir], { encoding: 'utf8' });
    expect(out).toMatch(/packs=1 questions=4/);
    const emitPath = join(dir, 'bulk.json');
    execFileSync('node', [VALIDATOR, dir, '--emit', emitPath], { encoding: 'utf8' });
    const emitted = JSON.parse(readFileSync(emitPath, 'utf8'));
    expect(Object.keys(emitted.items[0]).sort()).toEqual([...BULK_FIELDS].sort());
  });
});
