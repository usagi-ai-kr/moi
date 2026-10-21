// 시험 선택 — 실제 <select>(가짜 비활성 selector 금지, 이슈 #239 AC 2).
// 셸 콘텐츠 최상단 공통 1개(#273) — nav/Drawer에는 두지 않는다.
import { copy } from '../copy';
import { useExamScope } from './ExamScopeProvider';
import './exam.css';

export function ExamSelector({ id, className }: { id: string; className?: string }) {
  const { code, exams, setExam } = useExamScope();
  const current = exams.find((e) => e.code === code) ?? exams[0];
  return (
    <span className={className ? `moi-exam-selector ${className}` : 'moi-exam-selector'}>
      {/* 라벨은 id로 select와 연결한다 — 접근 이름이 "시험" 하나로 유일하다. */}
      <label className="moi-exam-selector-label" htmlFor={id}>
        {copy.exam.label}
      </label>
      <select
        id={id}
        className="moi-exam-select"
        value={code}
        title={current?.fullLabel}
        onChange={(e) => setExam(e.target.value)}
      >
        {exams.map((e) => (
          <option key={e.code} value={e.code}>
            {e.label}
          </option>
        ))}
      </select>
    </span>
  );
}
