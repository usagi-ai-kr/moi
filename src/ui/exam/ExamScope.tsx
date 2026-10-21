// 시험 라벨·배지 — 현재 시험 기준을 화면에 드러낸다 (ADR-0068, 이슈 #239 AC 1).
// code를 넘기면 그 시험(예: 결과 화면의 세트 소유 시험)을, 없으면 context의 선택 시험을 쓴다.
import { copy } from '../copy';
import { findExam } from './exam-catalog';
import { useExamScope } from './ExamScopeProvider';
import './exam.css';

export function ExamScope({ code, className }: { code?: string; className?: string }) {
  const { code: contextCode, exams } = useExamScope();
  const entry = findExam(code ?? contextCode, exams);
  // 미등록 코드는 표시하지 않는다 — 내부 식별자 노출 방지.
  if (!entry) return null;
  return (
    <span
      className={className ? `moi-exam-scope ${className}` : 'moi-exam-scope'}
      data-exam-code={entry.code}
    >
      <span className="moi-exam-scope-label">{copy.exam.scopeLabel}</span>
      <span className="moi-exam-scope-name">{entry.label}</span>
    </span>
  );
}
