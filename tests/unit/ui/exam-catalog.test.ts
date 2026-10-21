import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXAM_CODE,
  EXAM_CATALOG,
  examLabel,
  findExam,
  isExamCode,
  resolveExamCode,
  type ExamCatalogEntry,
} from '../../../src/ui/exam/exam-catalog';

// #239 AC-3 URL 계약 — ?exam=<공개 코드> 허용목록·기본값·정규화 (ADR-0068).
describe('exam catalog (AC-3)', () => {
  it('허용목록은 공개 코드만 담고 기본값은 saa-c03이다', () => {
    expect(EXAM_CATALOG.map((e) => e.code)).toEqual(['saa-c03']);
    expect(DEFAULT_EXAM_CODE).toBe('saa-c03');
    for (const entry of EXAM_CATALOG) {
      expect(entry.code).toMatch(/^[a-z0-9-]+$/);
      expect(entry.code).not.toMatch(/^[0-9a-f]{8}-/); // UUID 금지
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.fullLabel.length).toBeGreaterThan(0);
    }
  });

  it('isExamCode는 허용목록의 값만 true다 (내부 ID·빈 값은 false)', () => {
    expect(isExamCode('saa-c03')).toBe(true);
    expect(isExamCode('exam-saa-c03')).toBe(false);
    expect(isExamCode('unknown')).toBe(false);
    expect(isExamCode('')).toBe(false);
    expect(isExamCode(null)).toBe(false);
    expect(isExamCode(undefined)).toBe(false);
  });

  it('findExam은 허용 코드의 항목을 찾고 그 외는 null이다', () => {
    expect(findExam('saa-c03')?.label).toBe('AWS SAA-C03');
    expect(findExam('exam-saa-c03')).toBeNull();
    expect(findExam(null)).toBeNull();
  });

  it('examLabel은 표시명을 돌려주고 미등록 코드는 빈 문자열이다(원문 노출 금지)', () => {
    expect(examLabel('saa-c03')).toBe('AWS SAA-C03');
    expect(examLabel('exam-saa-c03')).toBe('');
    expect(examLabel(undefined)).toBe('');
  });

  it('resolveExamCode — 유효값은 그대로, 없으면 기본값(URL 유지), 그 외는 기본값+replace', () => {
    expect(resolveExamCode('saa-c03')).toEqual({ code: 'saa-c03', needsReplace: false });
    expect(resolveExamCode(null)).toEqual({ code: DEFAULT_EXAM_CODE, needsReplace: false });
    expect(resolveExamCode('unknown')).toEqual({ code: DEFAULT_EXAM_CODE, needsReplace: true });
    expect(resolveExamCode('exam-saa-c03')).toEqual({ code: DEFAULT_EXAM_CODE, needsReplace: true });
    expect(resolveExamCode('')).toEqual({ code: DEFAULT_EXAM_CODE, needsReplace: true });
  });

  it('주입한 목록으로도 같은 규칙이 적용된다 (시험 추가 절차 검증)', () => {
    const list: readonly ExamCatalogEntry[] = [
      { code: 'saa-c03', label: 'AWS SAA-C03', fullLabel: '...' },
      { code: 'dva-c02', label: 'AWS DVA-C02', fullLabel: '...' },
    ];
    expect(isExamCode('dva-c02', list)).toBe(true);
    expect(resolveExamCode('dva-c02', list)).toEqual({ code: 'dva-c02', needsReplace: false });
    expect(resolveExamCode('unknown', list)).toEqual({ code: DEFAULT_EXAM_CODE, needsReplace: true });
    expect(examLabel('dva-c02', list)).toBe('AWS DVA-C02');
  });
});
