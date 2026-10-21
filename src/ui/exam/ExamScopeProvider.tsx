// 시험 context — ?exam=<공개 코드>가 단일 진실 원천 (ADR-0068, 이슈 #239).
// Provider는 라우터 안에 두고(AuthenticatedApp) useSearchParams로 URL을 읽고,
// 화면·API 호출은 useExamScope()로 현재 시험(공개 코드)을 소비한다.
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  DEFAULT_EXAM_CODE,
  EXAM_CATALOG,
  examLabel,
  isExamCode,
  resolveExamCode,
  type ExamCatalogEntry,
} from './exam-catalog';

export interface ExamScopeValue {
  /** 현재 시험 공개 코드 (URL 축). */
  readonly code: string;
  /** API 전달용 시험 식별자 — 공개 코드 축(ADR-0058). */
  readonly examId: string;
  /** 현재 시험 표시명. */
  readonly label: string;
  /** 선택 가능한 시험 목록(허용목록). */
  readonly exams: readonly ExamCatalogEntry[];
  /** 시험 변경 — pathname·다른 query 보존, page만 1로 초기화. */
  readonly setExam: (code: string) => void;
}

// Provider 밖에서도 안전하게 읽는 기본값 — 단위 테스트·부분 렌더 호환.
const DEFAULT_VALUE: ExamScopeValue = {
  code: DEFAULT_EXAM_CODE,
  examId: DEFAULT_EXAM_CODE,
  label: examLabel(DEFAULT_EXAM_CODE),
  exams: EXAM_CATALOG,
  setExam: () => {},
};

/** 시험 context — Provider 밖에서 직접 값을 주입할 때도 사용한다. */
export const ExamScopeContext = createContext<ExamScopeValue>(DEFAULT_VALUE);

/** 현재 시험 상태 — code·examId·label·exams·setExam. */
export function useExamScope(): ExamScopeValue {
  return useContext(ExamScopeContext);
}

/**
 * 시험 context Provider — 라우터 내부에서만 쓴다.
 * - 잘못된 ?exam 값은 기본값으로 replace(히스토리 오염 없음).
 * - 시험 변경은 push(뒤로가기로 직전 시험 복원) · page만 1로 · tab은 유지.
 */
export function ExamScopeProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('exam');
  const { code, needsReplace } = resolveExamCode(raw);

  // 잘못된 값 정규화 — 기본값으로 replace한다(사용자 이동이 아님).
  useEffect(() => {
    if (!needsReplace) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('exam', DEFAULT_EXAM_CODE);
        return next;
      },
      { replace: true },
    );
  }, [needsReplace, setSearchParams]);

  const setExam = useCallback(
    (next: string) => {
      // 허용목록 밖 값(내부 ID 포함)은 받지 않는다.
      if (!isExamCode(next)) return;
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set('exam', next);
        // 시험이 바뀌면 페이지는 1로, 탭은 시험과 무관하므로 유지한다.
        if (params.has('page')) params.set('page', '1');
        return params;
      });
    },
    [setSearchParams],
  );

  const value = useMemo<ExamScopeValue>(
    () => ({
      code,
      examId: code,
      label: examLabel(code),
      exams: EXAM_CATALOG,
      setExam,
    }),
    [code, setExam],
  );

  return <ExamScopeContext.Provider value={value}>{children}</ExamScopeContext.Provider>;
}
