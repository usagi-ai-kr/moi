// #134 등록 운영 스크립트의 순수 함수 검증 (Given/When/Then, Red→Green)
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs 운영 스크립트는 별도 타입 선언 없이 Node ESM으로 직접 검증한다.
import { buildBulkPayload, chunkItems, domainDistribution, filterPackFiles, idempotencyKey } from '../../../scripts/register-content.mjs';

const SCRIPT = fileURLToPath(new URL('../../../scripts/register-content.mjs', import.meta.url));

function bulkItem(index: number, domainCode = 'security') {
  return {
    examCode: 'saa-c03',
    domainCode,
    stem: `문항 ${index}`,
    explanation: '해설',
    sourceUrls: ['https://docs.aws.amazon.com/'],
    answerOptionKeys: ['A'],
    optionSetHash: 'hash',
    options: [
      { optionKey: 'A', text: '보기 A' },
      { optionKey: 'B', text: '보기 B' },
    ],
  };
}

const ITEMS = Array.from({ length: 500 }, (_, i) => bulkItem(i));

describe('Given 500문항 / When 청크 분할 / Then 100개 이하 5청크', () => {
  it('500문항은 100/100/100/100/100으로 나뉘고 마지막 청크 크기를 지킨다', () => {
    const chunks = chunkItems(ITEMS, 100);
    expect(chunks).toHaveLength(5);
    expect(chunks.map((chunk: unknown[]) => chunk.length)).toEqual([100, 100, 100, 100, 100]);
    expect(chunkItems(ITEMS.slice(0, 250), 100).map((chunk: unknown[]) => chunk.length)).toEqual([
      100, 100, 50,
    ]);
  });

  it('청크 크기가 1~100을 벗어나면 거부한다', () => {
    expect(() => chunkItems(ITEMS, 101)).toThrow(RangeError);
    expect(() => chunkItems(ITEMS, 0)).toThrow(RangeError);
  });
});

describe('Given 동일 청크 / When Idempotency-Key 계산 / Then 입력에 대해 결정적', () => {
  it('같은 입력은 같은 키, 입력 변경은 다른 키를 만든다', () => {
    const chunk = ITEMS.slice(0, 100);
    const key = idempotencyKey(1, chunk);
    expect(key).toBe(idempotencyKey(1, chunk));
    expect(key).toMatch(/^content-1-[0-9a-f]{64}$/);
    const changed = [...chunk.slice(1), bulkItem(999, 'resilience')];
    expect(idempotencyKey(1, changed)).not.toBe(key);
  });
});

describe('Given 예시 팩과 실제 팩 / When 등록 대상 선택 / Then sample-pack 제외', () => {
  it('sample-pack.json은 어떤 경로에서도 제외한다', () => {
    const files = [
      '/content/saa-c03/sample-pack.json',
      '/content/saa-c03/pack-1.json',
      '/content/saa-c03/nested/sample-pack.json',
    ];
    expect(filterPackFiles(files)).toEqual(['/content/saa-c03/pack-1.json']);
  });
});

describe('Given 작성 팩 / When bulk payload 생성 / Then API 계약 형태', () => {
  it('questionId를 제거하고 optionSetHash·도메인 분포를 계산한다', () => {
    const pack = {
      packId: 'p1',
      examCode: 'saa-c03',
      items: [
        {
          questionId: 'q-1',
          domainCode: 'security',
          stem: '줄기',
          explanation: '해설',
          sourceUrls: ['https://docs.aws.amazon.com/ec2/index.html'],
          answerOptionKeys: ['B'],
          options: [
            { optionKey: 'A', text: '보기 A' },
            { optionKey: 'B', text: '보기 B' },
          ],
        },
      ],
    };
    const payload = buildBulkPayload([{ pack, file: '/content/p1.json' }]);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).not.toHaveProperty('questionId');
    expect(payload.items[0].optionSetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(domainDistribution(payload.items)).toEqual({ security: 1 });
  });
});

describe('Given 스크립트 모듈 / When import / Then CLI가 실행되지 않는다', () => {
  it('import만으로는 사용법·네트워크가 실행되지 않는다(가드)', () => {
    const out = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log('imported');`,
      ],
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('imported');
  });
});
