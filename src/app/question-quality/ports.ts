import type { QuestionDraft } from '@/domain/question-quality/types';

/**
 * 문제 초안 생성 Port (이슈 #48, ADR-0019 제작·게시).
 * 실제 AI provider는 인프라/운영 단계(#55)에서 주입하고, app은 계약만 안다.
 * 테스트는 fake 구현만 사용한다(실제 AI 호출 금지 — 브리프 범위).
 */
export interface QuestionGenerator {
  /** 초안 생성 — 결정적 fake provider가 이 계약을 충족한다. */
  generateDrafts(input: { count: number }): Promise<readonly QuestionDraft[]>;
}