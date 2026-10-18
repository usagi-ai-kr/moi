import type {
  AuditLog,
  Exam,
  ExamDomain,
  Question,
  QuestionOption,
  QuestionVersion,
} from '@/domain/question/question';
import { assertValidStatus } from '@/domain/question/question';
import type {
  auditLogs,
  examDomains,
  exams,
  questionOptions,
  questionVersions,
  questions,
} from './schema';

/**
 * Drizzle 행 → domain 타입 변환 mapper (ADR-0001/0019).
 * domain은 Drizzle 스키마 타입을 직접 참조하지 않는다 — 이 모듈만 두 계층 사이를 연결한다.
 * JSON 컬럼(mode: 'json')은 Drizzle이 파싱하므로 그대로 전달한다.
 */

type ExamRow = typeof exams.$inferSelect;
type ExamDomainRow = typeof examDomains.$inferSelect;
type QuestionRow = typeof questions.$inferSelect;
type QuestionVersionRow = typeof questionVersions.$inferSelect;
type QuestionOptionRow = typeof questionOptions.$inferSelect;
type AuditLogRow = typeof auditLogs.$inferSelect;

export function toExam(row: ExamRow): Exam {
  return { id: row.id, code: row.code, name: row.name, createdAt: row.createdAt };
}

export function toExamDomain(row: ExamDomainRow): ExamDomain {
  return {
    id: row.id,
    examId: row.examId,
    code: row.code,
    name: row.name,
    weight: row.weight,
  };
}

export function toQuestion(row: QuestionRow): Question {
  assertValidStatus(row.status);
  return {
    id: row.id,
    examId: row.examId,
    domainId: row.domainId,
    status: row.status,
    currentVersionNo: row.currentVersionNo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toQuestionVersion(row: QuestionVersionRow): QuestionVersion {
  return {
    id: row.id,
    questionId: row.questionId,
    versionNo: row.versionNo,
    stem: row.stem,
    explanation: row.explanation,
    sourceUrls: row.sourceUrls,
    answerOptionIds: row.answerOptionIds,
    optionSetHash: row.optionSetHash,
    reviewStatus: row.reviewStatus,
    createdAt: row.createdAt,
    supersededAt: row.supersededAt,
  };
}

export function toQuestionOption(row: QuestionOptionRow): QuestionOption {
  return {
    id: row.id,
    questionVersionId: row.questionVersionId,
    optionKey: row.optionKey,
    text: row.text,
  };
}

export function toAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    requestId: row.requestId,
    createdAt: row.createdAt,
  };
}
