import { describe, expect, it } from 'vitest';
import {
  checkMermaidLabels,
  isQuotedLabel,
  mermaidBlocks,
  reservedLabelChars,
  scanNodeLabels,
} from '@/domain/question-quality/rules/mermaid';
import { makeDraft } from './fixtures';

// 이슈 #134·#168, ADR-0044 — Mermaid 노드 라벨의 예약 문자는 큰따옴표로 인용한다(규칙 10).

function withMermaid(body: string): string {
  return `도식 설명이다.\n\n\`\`\`mermaid\n${body}\n\`\`\``;
}

describe('mermaidBlocks', () => {
  it('mermaid 펜스 본문만 순서대로 추출하고 다른 코드 블록은 무시한다', () => {
    const explanation = [
      '첫 도식',
      '',
      '```mermaid',
      'flowchart LR',
      '  A --> B',
      '```',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      '```mermaid',
      'graph TD',
      '  C --> D',
      '```',
    ].join('\n');

    expect(mermaidBlocks(explanation)).toEqual(['flowchart LR\n  A --> B\n', 'graph TD\n  C --> D\n']);
  });

  it('mermaid 블록이 없으면 빈 배열', () => {
    expect(mermaidBlocks('도식 없는 해설이다.')).toEqual([]);
  });
});

describe('scanNodeLabels', () => {
  it('인용 라벨을 셰이프와 라벨 원문으로 추출한다', () => {
    expect(scanNodeLabels('  C[Client] --> G["Global Accelerator (고정 IP)"]')).toEqual([
      { shape: '[]', label: 'Client' },
      { shape: '[]', label: '"Global Accelerator (고정 IP)"' },
    ]);
  });

  it('간선 라벨(|...|)은 노드 라벨로 보지 않는다', () => {
    expect(scanNodeLabels('  G -->|정상 (TTL 0)| A[ALB 리전 A]')).toEqual([{ shape: '[]', label: 'ALB 리전 A' }]);
  });

  it('멀티 셰이프 라벨을 각각 인식한다', () => {
    const line = 'S[[스토리지]] --> C((결정)) --> D{{의사결정}} --> E[(DB)] --> F([시작]) --> H>종료]';

    expect(scanNodeLabels(line)).toEqual([
      { shape: '[[]]', label: '스토리지' },
      { shape: '(())', label: '결정' },
      { shape: '{{}}', label: '의사결정' },
      { shape: '[()]', label: 'DB' },
      { shape: '([])', label: '시작' },
      { shape: '>]', label: '종료' },
    ]);
  });

  it('라벨이 없는 간선만 있는 줄은 빈 배열', () => {
    expect(scanNodeLabels('  A --> B')).toEqual([]);
  });
});

describe('isQuotedLabel', () => {
  it.each([
    ['"Global Accelerator (고정 IP)"', true],
    ['""', true],
    ['Global Accelerator (고정 IP)', false],
    ['"a"b"', false],
    ['"', false],
  ])('%s → %s', (label, expected) => {
    expect(isQuotedLabel(label)).toBe(expected);
  });
});

describe('reservedLabelChars', () => {
  it('예약 문자를 정의된 순서로 반환한다', () => {
    expect(reservedLabelChars('Global Accelerator (고정 IP)')).toEqual(['(', ')']);
    expect(reservedLabelChars('a|b@c')).toEqual(['|', '@']);
  });

  it('예약 문자가 없으면 빈 배열', () => {
    expect(reservedLabelChars('Client')).toEqual([]);
  });
});

describe('checkMermaidLabels (규칙 10: 라벨 인용)', () => {
  it('인용한 예약 문자 라벨은 통과한다', () => {
    const draft = makeDraft({
      explanation: withMermaid(
        'flowchart LR\n  C[Client] --> G["Global Accelerator (고정 IP)"]\n  G -->|정상| A[ALB 리전 A]',
      ),
    });

    expect(checkMermaidLabels(draft)).toEqual([]);
  });

  it('인용하지 않은 예약 문자 라벨은 실패하고 사유에 문자·라벨을 남긴다', () => {
    const draft = makeDraft({
      id: 'saa-res-0129',
      explanation: withMermaid('flowchart LR\n  C[Client] --> G[Global Accelerator (고정 IP)]'),
    });

    const findings = checkMermaidLabels(draft);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.questionId).toBe('saa-res-0129');
    expect(findings[0]?.checkId).toBe('mermaid-label');
    expect(findings[0]?.reason).toBe(
      'mermaid-label: Mermaid 라벨의 예약 문자(())는 큰따옴표로 인용해야 한다 — Global Accelerator (고정 IP)',
    );
  });

  it('예약 문자가 없는 라벨은 통과한다', () => {
    const draft = makeDraft({ explanation: withMermaid('flowchart LR\n  C[Client] --> A[ALB 리전 A]') });

    expect(checkMermaidLabels(draft)).toEqual([]);
  });

  it('간선 라벨의 예약 문자는 검사하지 않는다', () => {
    const draft = makeDraft({ explanation: withMermaid('flowchart LR\n  G -->|정상 (TTL 0)| A[ALB]') });

    expect(checkMermaidLabels(draft)).toEqual([]);
  });

  it.each([
    ['[[]]', 'S[[스토리지 (S3)]]'],
    ['(())', 'C((결정 (승인)))'],
    ['{{}}', 'D{{의사결정 (승인)}}'],
    ['[()]', 'E[(DB (운영))]'],
    ['([])', 'F([시작 (요청)])'],
    ['>]', 'H>종료 (배포)]'],
  ])('멀티 셰이프 %s의 미인용 예약 문자를 검출한다', (_shape, node) => {
    const draft = makeDraft({ explanation: withMermaid(`flowchart LR\n  ${node}`) });

    expect(checkMermaidLabels(draft).map((finding) => finding.checkId)).toEqual(['mermaid-label']);
  });

  it('여러 블록을 모두 검사한다(첫 블록이 정상이어도 둘째 위반을 찾는다)', () => {
    const explanation = [
      '```mermaid',
      'flowchart LR',
      '  A["정상 (인용)"] --> B[정상]',
      '```',
      '',
      '```mermaid',
      'flowchart TD',
      '  C[위반 (미인용)] --> D[정상]',
      '```',
    ].join('\n');

    const findings = checkMermaidLabels(makeDraft({ explanation }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain('위반 (미인용)');
  });

  it('첫 위반만 결정적으로 보고한다(블록 → 줄 → 라벨 순서)', () => {
    const explanation = withMermaid(
      'flowchart LR\n  A[첫 (위반)] --> B[둘째 (위반)]\n  C[셋째 (위반)]',
    );

    const draft = makeDraft({ id: 'q-deterministic', explanation });

    const first = checkMermaidLabels(draft);
    const second = checkMermaidLabels(draft);

    expect(first).toHaveLength(1);
    expect(first[0]?.reason).toContain('첫 (위반)');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('mermaid 블록이 없거나 다른 코드 블록이면 통과한다', () => {
    const draft = makeDraft({ explanation: '평문 해설\n\n```ts\nconst x = "a (b)";\n```' });

    expect(checkMermaidLabels(draft)).toEqual([]);
  });
});
