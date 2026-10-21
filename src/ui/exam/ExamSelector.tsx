// 시험 선택 — 실제 <select>(가짜 비활성 selector 금지, 이슈 #239 AC 2).
// 셸 콘텐츠 최상단 공통 1개(#273) — nav/Drawer에는 두지 않는다.
import { copy } from '../copy';
import { iconSelect } from '../icons';
import { useExamScope } from './ExamScopeProvider';
import './exam.css';

// chevron은 위치 제어용 장식 아이콘 — 네이티브 select semantics는 그대로 둔다 (#285).
const SelectIcon = iconSelect.icon;

export function ExamSelector({ id, className }: { id: string; className?: string }) {
  const { code, exams, setExam } = useExamScope();
  const current = exams.find((e) => e.code === code) ?? exams[0];
  return (
    <span className={className ? `moi-exam-selector ${className}` : 'moi-exam-selector'}>
      {/* 라벨은 id로 select와 연결한다 — 접근 이름이 "시험" 하나로 유일하다. */}
      <label className="moi-exam-selector-label" htmlFor={id}>
        {copy.exam.label}
      </label>
      <span className="moi-exam-select-wrap">
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
        <SelectIcon size={iconSelect.size} aria-hidden="true" focusable="false" className="moi-exam-select-chevron" />
      </span>
    </span>
  );
}
