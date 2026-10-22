import type { QuestionDraft, QuestionOption, SaaDomain } from '@/domain/question-quality/types';

/**
 * 품질 검사 fixture 팩토리 — 결정적 고정값만 사용한다(실제 AI/DB 미사용, 이슈 #48).
 * `makeDraft(overrides)`로 정상 문제를 만들고 각 규칙의 음성 케이스를 필드 치환으로 만든다.
 */

let seq = 0;

export function makeOptions(texts: readonly string[], prefix = 'opt'): QuestionOption[] {
  return texts.map((text, i) => ({ id: `${prefix}-${i + 1}`, text }));
}

export function makeDraft(overrides?: Partial<QuestionDraft> & { optionTexts?: string[] }): QuestionDraft {
  seq += 1;
  // 기본 보기 텍스트에 초안 순번을 심어 배치 내 option set 중복 오탐을 막는다.
  const optionTexts = overrides?.optionTexts ?? [
    `A안 ${seq}: 퍼블릭 서브넷에 배치`,
    `B안 ${seq}: 프라이빗 서브넷에 배치`,
    `C안 ${seq}: 전용 호스트에 배치`,
    `D안 ${seq}: 온프레미스에 배치`,
  ];
  const options = overrides?.options ?? makeOptions(optionTexts);
  const base: QuestionDraft = {
    id: overrides?.id ?? `q-${seq}`,
    exam: overrides?.exam ?? 'AWS-SAA-C03',
    domain: overrides?.domain ?? 'security',
    stem: overrides?.stem ?? '다음 중 다중 AZ 구성에서 가용성을 높이는 방법으로 가장 적절한 것은?',
    options,
    answerOptionIds: overrides?.answerOptionIds ?? [options[1]?.id ?? 'opt-2'],
    explanation: overrides?.explanation ?? '프라이빗 서브넷에 배치하고 여러 AZ에 걸쳐 두면 가용성이 높아진다.',
    sourceUrls: overrides?.sourceUrls ?? ['https://docs.aws.amazon.com/vpc/'],
  };
  return base;
}

/** 배치 분포를 맞추기 위한 도메인 목표 비율 (150/130/120/100 → 500). */
export function domainFor(index: number, size: number): SaaDomain {
  const share = index / size;
  if (share < 150 / 500) return 'security';
  if (share < 280 / 500) return 'resilience';
  if (share < 400 / 500) return 'performance';
  return 'cost-optimization';
}

/** 각 문제의 정답 위치를 순환시켜 위치 편향이 없는 정상 배치를 만든다. */
export function rotateAnswerIndex(drafts: QuestionDraft[]): QuestionDraft[] {
  return drafts.map((draft, i) => {
    const answerId = draft.options[i % draft.options.length]?.id ?? draft.options[0]?.id ?? '';
    return { ...draft, answerOptionIds: [answerId] };
  });
}
