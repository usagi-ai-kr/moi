/**
 * 문제 품질 검사 도메인 타입 (이슈 #48, ADR-0019).
 * - 순수 TS: 외부 패키지·DB·네트워크 의존 금지(ADR-0001).
 * - `QuestionDraft`는 AI 초안(생성 단계) 입력이며, 식별자 분리 원칙(문제 ID/개정 버전/보기 ID/화면 번호)에 따라
 *   본 단위는 초안 검증까지만 다룬다(개정 버전·게시 상태는 등록 단계 #47 소관).
 * - `sourceUrls`는 AWS 공식 문서 근거 URL — URL 유효성만으로 정답 타당성을 보장하지 않는다(검사 주석·리포트 기록).
 */

/** 시험 식별자 — ADR-0019의 SAA-C03 단일 시험(시험 독립 구조는 등록 계층 #47이 확장). */
export type ExamId = 'AWS-SAA-C03';

/** SAA-C03 영역 — 목표 배분: 보안 150·복원력 130·성능 120·비용 최적화 100 (500문제). */
export type SaaDomain = 'security' | 'resilience' | 'performance' | 'cost-optimization';

export interface QuestionOption {
  /** 보기 고유 ID(문제 ID와 분리). */
  readonly id: string;
  readonly text: string;
}

export interface QuestionDraft {
  readonly id: string;
  readonly exam: ExamId;
  readonly domain: SaaDomain;
  readonly stem: string;
  readonly options: readonly QuestionOption[];
  readonly answerOptionIds: readonly string[];
  readonly explanation: string;
  readonly sourceUrls: readonly string[];
}

/** 검사 규칙 식별자 — 리포트·테스트의 결정적 계약. */
export type QualityCheckId =
  | 'required-fields'
  | 'answer-consistency'
  | 'duplication'
  | 'option-bias'
  | 'answer-position-bias'
  | 'explanation-format'
  | 'source-url'
  | 'domain-distribution'
  | 'batch-duplication';

/** 문제 단위 검사 위반 — `reason`은 결정적 한국어 문구(같은 입력 같은 결과). */
export interface QuestionFinding {
  readonly questionId: string;
  readonly checkId: QualityCheckId;
  readonly reason: string;
}

/** 배치 단위 검사 위반 — 위치 편향·영역 분포·배치 중복·빈 배치. */
export interface BatchFinding {
  readonly checkId: 'answer-position-bias' | 'domain-distribution' | 'batch-duplication' | 'empty-batch';
  readonly reason: string;
  readonly questionIds: readonly string[];
}

export interface QuestionQualityResult {
  readonly questionId: string;
  readonly pass: boolean;
  readonly findings: readonly QuestionFinding[];
}

export interface QualityReport {
  readonly results: readonly QuestionQualityResult[];
  readonly batchFindings: readonly BatchFinding[];
  readonly passedCount: number;
  readonly failedCount: number;
  /** 전체 통과 = 모든 문제 pass && 배치 위반 0 && 배치 비어 있지 않음. */
  readonly pass: boolean;
  /** 배치 요약 — 영역별 문제 수(ADR-0019 영역 목표 검증 입력). */
  readonly domainCounts: Readonly<Record<SaaDomain, number>>;
}
