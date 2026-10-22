import type { QuestionDraft, QuestionFinding } from '../types';
import { internalSeparatorCount, normalizeText, sentenceCount } from '../normalize';
import { EXPLANATION_MAX_SENTENCES, OPTION_DETAIL_MIN_SEPARATORS, OPTION_LENGTH_BIAS_RATIO } from '../thresholds';

/**
 * 규칙 3·4·6·7 — 문제 단위 텍스트 검사 (이슈 #48, ADR-0019).
 * 규칙 3: 문제 내 option 텍스트 중복(정규화) — 배치 stem 중복은 규칙 9(batch) 소관.
 * 규칙 4: 정답만 유독 길거나 상세한 단서(길이 비율·정보량) — 복수 정답 문제는 판정 제외.
 * 규칙 6: 해설 길이·형식(권장 1~2문장, 4문장 이상 과길이 실패).
 * 규칙 7: 근거 URL 존재·형식 — URL 유효성만으로 정답 타당성을 보장하지 않는다(ADR-0019).
 */

export function checkOptionDuplication(draft: QuestionDraft): QuestionFinding[] {
  const seen = new Set<string>();
  for (const option of draft.options) {
    const normalized = normalizeText(option.text);
    if (seen.has(normalized)) {
      return [{ questionId: draft.id, checkId: 'duplication', reason: 'duplication: 문제 내 option 텍스트가 중복된다' }];
    }
    seen.add(normalized);
  }
  return [];
}

export function checkOptionBias(draft: QuestionDraft): QuestionFinding[] {
  if (draft.answerOptionIds.length !== 1) {
    return []; // 복수 정답은 길이 단서 기준이 모호해 판정하지 않는다
  }
  const answerId = draft.answerOptionIds[0];
  const correct = draft.options.find((option) => option.id === answerId);
  const others = draft.options.filter((option) => option.id !== answerId);
  if (correct === undefined || others.length === 0) {
    return []; // 정답 일치 검사(규칙 2)가 이미 실패를 기록한다
  }

  const otherLengths = others.map((option) => option.text.length).sort((a, b) => a - b);
  const median = otherLengths[Math.floor((otherLengths.length - 1) / 2)] ?? 0;
  const correctLength = correct.text.length;
  if (median > 0 && correctLength > median * OPTION_LENGTH_BIAS_RATIO) {
    return [
      {
        questionId: draft.id,
        checkId: 'option-bias',
        reason: 'option-bias: 정답 선택지가 다른 보기보다 유독 길다',
      },
    ];
  }

  const correctSeparators = internalSeparatorCount(correct.text);
  if (
    correctSeparators >= OPTION_DETAIL_MIN_SEPARATORS &&
    others.every((option) => internalSeparatorCount(option.text) === 0)
  ) {
    return [
      {
        questionId: draft.id,
        checkId: 'option-bias',
        reason: 'option-bias: 정답 선택지가 유독 상세하게 나열되어 있다',
      },
    ];
  }
  return [];
}

export function checkExplanationFormat(draft: QuestionDraft): QuestionFinding[] {
  if (sentenceCount(draft.explanation) > EXPLANATION_MAX_SENTENCES) {
    return [
      {
        questionId: draft.id,
        checkId: 'explanation-format',
        reason: `explanation-format: 해설이 과길이다(권장 1~2문장, 최대 ${EXPLANATION_MAX_SENTENCES}문장)`,
      },
    ];
  }
  return [];
}

export function checkSourceUrls(draft: QuestionDraft): QuestionFinding[] {
  // URL 형식 검사일 뿐 — 정답 타당성(내용 일치)은 자동 검수가 보장하지 않는다(ADR-0019).
  for (const url of draft.sourceUrls) {
    if (!isValidHttpUrl(url)) {
      return [{ questionId: draft.id, checkId: 'source-url', reason: 'source-url: 근거 URL 형식이 올바르지 않다(https 필요)' }];
    }
  }
  return [];
}

function isValidHttpUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'; // 근거 문서는 TLS 필수(AWS 공식 문서 기준)
  } catch {
    return false;
  }
}
