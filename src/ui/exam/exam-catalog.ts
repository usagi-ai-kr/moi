// 시험 카탈로그 — 공개 코드만 다루는 단일 소스 (ADR-0068, 이슈 #239).
// React 무의존 순수 모듈 — URL 해석·표시 라벨을 한 곳에서 결정한다.
// 원칙: 내부 ID(UUID·exam-saa-c03 류)는 여기 넣지 않는다. 공개 코드만 허용한다.

// 카탈로그 1건 — 화면 표시용 짧은 이름 + 정식 시험명.
export interface ExamCatalogEntry {
  /** 공개 코드 — URL(?exam=)·API(examId) 축. 내부 식별자를 넣지 않는다. */
  readonly code: string;
  /** 화면 표시용 짧은 이름 (배지·선택 목록). */
  readonly label: string;
  /** 정식 시험명 — 회전형 제목·툴팁용. */
  readonly fullLabel: string;
}

// 지원 시험 목록 — 시험을 추가할 때 이 배열만 늘린다 (ADR-0068 결정 ②).
export const EXAM_CATALOG: readonly ExamCatalogEntry[] = [
  {
    code: 'saa-c03',
    label: 'AWS SAA-C03',
    fullLabel: 'AWS Certified Solutions Architect – Associate (SAA-C03)',
  },
];

// 기본 시험 — ?exam=이 없거나 잘못됐을 때의 기준 (Phase 1 단일 시험).
export const DEFAULT_EXAM_CODE = 'saa-c03';

/** 허용목록에 있는 공개 코드인지 확인 — 내부 ID는 항상 false. */
export function isExamCode(
  value: string | null | undefined,
  list: readonly ExamCatalogEntry[] = EXAM_CATALOG,
): value is string {
  return typeof value === 'string' && list.some((e) => e.code === value);
}

/** 허용목록에서 시험을 찾는다 — 없으면 null(표시하지 않는다). */
export function findExam(
  code: string | null | undefined,
  list: readonly ExamCatalogEntry[] = EXAM_CATALOG,
): ExamCatalogEntry | null {
  if (typeof code !== 'string') return null;
  return list.find((e) => e.code === code) ?? null;
}

/** 시험 표시명 — 미등록 코드는 빈 문자열(원문 노출 금지). */
export function examLabel(
  code: string | null | undefined,
  list: readonly ExamCatalogEntry[] = EXAM_CATALOG,
): string {
  return findExam(code, list)?.label ?? '';
}

/**
 * URL 해석 — ① 유효 코드면 그대로 ② 없으면 기본값(URL 유지) ③ 그 외 기본값(replace).
 * needsReplace는 "주소를 기본값으로 교체해야 하는가"를 뜻한다.
 */
export function resolveExamCode(
  raw: string | null,
  list: readonly ExamCatalogEntry[] = EXAM_CATALOG,
  defaultCode: string = DEFAULT_EXAM_CODE,
): { code: string; needsReplace: boolean } {
  if (raw === null) return { code: defaultCode, needsReplace: false };
  if (isExamCode(raw, list)) return { code: raw, needsReplace: false };
  return { code: defaultCode, needsReplace: true };
}
