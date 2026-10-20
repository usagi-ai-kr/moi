import type { QuestionDraft, QuestionFinding } from '../types';

/**
 * 규칙 10 — 해설 Mermaid 도식 라벨의 인용 계약 (이슈 #134·#168, ADR-0044).
 *
 * 배경: `G[Global Accelerator (고정 IP)]`처럼 괄호 등 예약 문자가 든 라벨은
 * Mermaid 파서에서 `Parse error`로 실패한다(12.2.0 실측). 앱은 원문 폴백으로
 * 넘어가므로 학습 자체는 깨지지 않지만 도식이 보이지 않는다. 같은 유형의 재발을
 * 막기 위해 라벨 작성 규칙을 품질 게이트에 포함한다.
 *
 * 결정: 노드 라벨에 예약 문자가 있으면 큰따옴표(`"..."`)로 인용해야 한다.
 * 순수 함수·외부 의존 없음(ADR-0001) — Mermaid을 직접 호출하지 않고 문법만 판정한다.
 */

/** 라벨 안에서 인용 없이 쓰면 Mermaid 파싱이 깨지는 예약 문자 (12.2.0 실측). */
const RESERVED_LABEL_CHARS: readonly string[] = ['(', ')', '[', ']', '{', '}', '"', '|', '@'];

/** 노드 셰이프 — 여는 문자 → 닫는 문자. 멀티 괄호 셰이프가 단일 괄호보다 먼저 온다. */
const SHAPE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['[[', ']]'],
  ['[(', ')]'],
  ['([', '])'],
  ['((', '))'],
  ['{{', '}}'],
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
  ['>', ']'],
];

/** Mermaid 코드 펜스 — 여는 줄 정보는 무시하고 본문만 추출한다. */
const MERMAID_BLOCK = '```mermaid[^\n]*\n([\\s\\S]*?)```';

export interface MermaidNodeLabel {
  /** 노드 셰이프 표기(예: `[]`, `[()]`, `{}`). */
  readonly shape: string;
  /** 셰이프 괄호 안의 라벨 원문. */
  readonly label: string;
}

/** 해설에서 Mermaid 코드 펜스 블록 본문을 순서대로 추출한다(펜스 닫힘은 별도 규칙이 본다). */
export function mermaidBlocks(explanation: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(MERMAID_BLOCK, 'g');
  let match = pattern.exec(explanation);
  while (match !== null) {
    blocks.push(match[1] ?? '');
    match = pattern.exec(explanation);
  }
  return blocks;
}

/** 한 줄에서 `id[라벨]` 형태의 노드 라벨을 추출한다. 라벨이 없는 간선은 무시한다. */
export function scanNodeLabels(line: string): MermaidNodeLabel[] {
  const found: MermaidNodeLabel[] = [];
  for (let index = 0; index < line.length; index += 1) {
    if (!/[A-Za-z0-9_]/.test(line[index] ?? '')) continue;
    let end = index;
    while (end + 1 < line.length && /[A-Za-z0-9_]/.test(line[end + 1] ?? '')) end += 1;
    const rest = line.slice(end + 1);
    const shape = SHAPE_PAIRS.find(([open]) => rest.startsWith(open));
    if (shape === undefined) {
      index = end;
      continue;
    }
    const [open, close] = shape;
    const labelStart = end + 1 + open.length;
    const labelEnd = line.indexOf(close, labelStart);
    if (labelEnd === -1) {
      index = end;
      continue;
    }
    found.push({ shape: open + close, label: line.slice(labelStart, labelEnd) });
    index = labelEnd + close.length - 1;
  }
  return found;
}

/** 라벨이 큰따옴표로 감싸졌는지 판정한다(끝 따옴표 외에 내부 따옴표가 없어야 한다). */
export function isQuotedLabel(label: string): boolean {
  return label.length >= 2 && label.startsWith('"') && label.endsWith('"') && label.indexOf('"', 1) === label.length - 1;
}

/** 라벨에 들어간 예약 문자 목록(순서 고정). */
export function reservedLabelChars(label: string): string[] {
  return RESERVED_LABEL_CHARS.filter((char) => label.includes(char));
}

/**
 * 규칙 10 — 노드 라벨의 예약 문자는 큰따옴표로 인용해야 한다.
 * 위반이 하나라도 있으면 첫 위반만 보고한다(결정적 순서: 블록 → 줄 → 라벨).
 */
export function checkMermaidLabels(draft: QuestionDraft): QuestionFinding[] {
  for (const block of mermaidBlocks(draft.explanation)) {
    for (const line of block.split('\n')) {
      for (const node of scanNodeLabels(line)) {
        const reserved = reservedLabelChars(node.label);
        if (reserved.length === 0 || isQuotedLabel(node.label)) continue;
        return [
          {
            questionId: draft.id,
            checkId: 'mermaid-label',
            reason: `mermaid-label: Mermaid 라벨의 예약 문자(${reserved.join('')})는 큰따옴표로 인용해야 한다 — ${node.label}`,
          },
        ];
      }
    }
  }
  return [];
}
