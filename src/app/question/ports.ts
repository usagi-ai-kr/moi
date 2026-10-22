import type {
  AuditLog,
  Exam,
  ExamDomain,
  Question,
  QuestionOption,
  QuestionVersion,
} from '@/domain/question/question';

/**
 * 문제은행 영속성 Port (이슈 #46, ADR-0019).
 * 구현은 infra/persistence의 D1/Drizzle 어댑터가 담당하고, app/domain은 DB를 모른다.
 * 읽기/버전 생성/비활성화 최소 집합 — 관리 API·출제(#47~#49)는 이 Port 위에서 확장한다.
 */

export interface CreateExamInput {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly now: number;
}

export interface CreateDomainInput {
  readonly id: string;
  readonly examId: string;
  readonly code: string;
  readonly name: string;
  readonly weight: number;
}

export interface CreateQuestionInput {
  readonly id: string;
  readonly examId: string;
  readonly domainId: string;
  readonly now: number;
}

export interface CreateVersionInput {
  readonly id: string;
  readonly questionId: string;
  readonly stem: string;
  readonly explanation: string;
  readonly sourceUrls: string[];
  readonly answerOptionIds: string[];
  readonly optionSetHash: string;
  readonly options: Array<{ readonly id: string; readonly optionKey: string; readonly text: string }>;
  readonly now: number;
}

export interface QuestionBankRepository {
  insertExam(input: CreateExamInput): Promise<{ id: string }>;
  insertDomain(input: CreateDomainInput): Promise<{ id: string }>;
  insertQuestion(input: CreateQuestionInput): Promise<{ id: string }>;
  /** 개정 + 보기 일괄 저장. 버전 번호는 어댑터가 기존 최대값 + 1로 부여한다. */
  insertVersion(input: CreateVersionInput): Promise<{ id: string; versionNo: number }>;
  /** `active` → `inactive`. 멱등(이미 inactive면 변경 없음). 물리 삭제는 제공하지 않는다. */
  deactivateQuestion(input: { questionId: string; now: number }): Promise<void>;
  findQuestion(input: { questionId: string }): Promise<Question | null>;
  /** `versionNo` 생략 시 최신 개정. */
  findVersion(input: { questionId: string; versionNo?: number }): Promise<QuestionVersion | null>;
  findOptionsByVersion(input: { questionVersionId: string }): Promise<QuestionOption[]>;
  /** 출제 대상 — `active`만, 생성 순서. */
  listActiveQuestions(input: { examId: string }): Promise<Question[]>;
  listDomains(input: { examId: string }): Promise<ExamDomain[]>;
  findExam(input: { examId: string }): Promise<Exam | null>;
  appendAuditLog(input: Omit<AuditLog, 'createdAt'> & { now: number }): Promise<void>;
}
