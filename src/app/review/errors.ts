/** HTTP 경계에서 invalid_question으로 안전하게 변환하는 복습 문제 참조 오류. */
export class InvalidReviewQuestionError extends Error {
  constructor() {
    super('invalid review question');
    this.name = 'InvalidReviewQuestionError';
  }
}
