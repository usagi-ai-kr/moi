import { assertAnswerOptionIdsSubset } from '@/domain/question/question';
import type { CreateVersionInput, QuestionBankRepository } from './ports';

/**
 * 문제 개정 등록 유스케이스 (이슈 #46, ADR-0019).
 * - 저장 전 도메인 검증: 정답 보기 집합은 해당 개정 보기 id의 부분집합이어야 한다.
 * - 버전 번호 부여는 어댑터(기존 최대값 + 1)에 위임한다.
 */
export async function registerQuestionVersion(
  repo: QuestionBankRepository,
  input: CreateVersionInput,
): Promise<{ id: string; versionNo: number }> {
  assertAnswerOptionIdsSubset(
    input.answerOptionIds,
    input.options.map((o) => o.id),
  );
  return repo.insertVersion(input);
}
