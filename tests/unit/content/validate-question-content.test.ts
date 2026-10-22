// #134 콘텐츠 작성 계약 검증기 단위 테스트 (Given/When/Then, Red→Green)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  chooseCountMismatch,
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

  it('해설 8000자 초과는 거부한다', () => {
    const pack = validPack({ items: [validItem({ explanation: '가'.repeat(8001) })] });
    expect(
      validatePack(pack, 'long.json').some((e: { message: string }) => e.message.includes('8000')),
    ).toBe(true);
  });

  it('닫히지 않은 펜스 블록(```mermaid 포함)은 거부한다', () => {
    const pack = validPack({
      items: [
        validItem({
          explanation: '엔드포인트 경로를 설명한다.\n```mermaid\nflowchart LR\n  A --> B',
        }),
      ],
    });
    expect(
      validatePack(pack, 'fence.json').some((e: { message: string }) => e.message.includes('code fence')),
    ).toBe(true);
  });

  it('해설의 원시 HTML·스크립트와 stem의 javascript: 는 거부한다', () => {
    const script = validPack({ items: [validItem({ explanation: '경로다. <script>alert(1)</script>' })] });
    expect(
      validatePack(script, 'script.json').some((e: { message: string }) => e.message.includes('<script')),
    ).toBe(true);
    const jsUrl = validPack({ items: [validItem({ stem: 'javascript:alert(1)' })] });
    expect(
      validatePack(jsUrl, 'js.json').some((e: { message: string }) => e.message.includes('javascript:')),
    ).toBe(true);
  });

  it('균형 잡힌 Markdown·Mermaid 해설은 통과한다', () => {
    const explanation = [
      '**핵심**은 프라이빗 접근이다.',
      '',
      '| 항목 | 값 |',
      '| --- | --- |',
      '| 경로 | VPC 엔드포인트 |',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[EC2] --> B[VPC Endpoint]',
      '  B --> C[S3]',
      '```',
    ].join('\n');
    expect(validatePack(validPack({ items: [validItem({ explanation })] }), 'md.json')).toEqual([]);
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

  describe('#308 지시문 개수-정답 수 일치 검사', () => {
    it('고르기 지시에 명시된 개수와 answerOptionKeys 개수가 일치하면 통과한다', () => {
      // 숫자·한글 수사 모두 지원(1개/두 가지).
      expect(chooseCountMismatch('이용 가능한 구성 1개를 고르시오.', 1)).toBeNull();
      expect(chooseCountMismatch('조건 두 가지를 고르시오.', 2)).toBeNull();
      expect(chooseCountMismatch('세 가지 요인을 선택하시오.', 3)).toBeNull();
      // 지시 개수 표현이 없으면 검사하지 않는다.
      expect(chooseCountMismatch('가장 적절한 것은 무엇인가?', 1)).toBeNull();
      expect(chooseCountMismatch('다음 중 모두에 해당하는 것을 고르시오.', 2)).toBeNull();
    });

    it('지시문이 1개를 요구하는데 정답이 2개면 발견한다(단일/복수 계약 불일치)', () => {
      expect(chooseCountMismatch('가장 적절한 것 1개를 고르시오.', 2)).toBe(
        'stem: choose-count mismatch (asks 1, answers 2)',
      );
      expect(chooseCountMismatch('주요 한 가지 결정 요소를 고르시오.', 2)).toContain('asks 1');
    });

    it('지시문이 두 가지를 요구하는데 정답이 1개면 발견한다', () => {
      expect(chooseCountMismatch('조정 정책 두 가지를 고르시오.', 1)).toContain('asks 2, answers 1');
    });

    it('validatePack에서도 지시 개수 불일치를 실패로 보고한다', () => {
      // stem·answerOptionKeys 는 **아이템** 단위 필드다(팩 오버라이드로 주면 무시된다).
      const bad = validPack({
        items: [validItem({ stem: '가장 적절한 구성 1개를 고르시오.', answerOptionKeys: ['A', 'B'] })],
      });
      const errors = validatePack(bad, 'count.json');
      expect(errors.some((e: { message: string }) => e.message.includes('choose-count mismatch'))).toBe(true);
      // 개수가 일치하면 오류가 없다.
      const good = validPack({
        items: [validItem({ stem: '가장 적절한 구성 1개를 고르시오.' })],
      });
      expect(validatePack(good, 'count-ok.json')).toEqual([]);
    });

    it('극적 수식어가 개수가 아닌 문장("5개의 버킷" 등)은 개수 지시로 오판하지 않는다', () => {
      // 개수 표현이 고르기 지시문 바로 앞(24자 내)에 있을 때만 검사한다.
      expect(chooseCountMismatch('5개의 버킷이며 여러 무결성 검사를 통해 가장 적절한 것은 무엇인가?', 1)).toBeNull();
      expect(chooseCountMismatch('200 GB 객체 업로드 이점 두 가지를 고르시오.', 2)).toBeNull();
    });
  });
});
