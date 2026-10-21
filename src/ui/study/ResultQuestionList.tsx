import { useId, useRef, type KeyboardEvent } from 'react';
import type { StudyPerItem } from '../api/client';
import { copy } from '../copy';
import {
  iconCorrect,
  iconPass,
  iconUnanswered,
  iconWrong,
  type IconSpec,
} from '../icons';

type StatusKey = 'correct' | 'incorrect' | 'pass' | 'unanswered';

// 색만으로 구분하지 않도록 상태마다 문구와 아이콘을 함께 쓴다(#132, #233 Slice B).
// 기호 텍스트(✓✕»—) 대신 icons.ts spec을 렌더한다 — 상태 라벨·aria는 그대로 둔다.
const STATUS: Record<StatusKey, { spec: IconSpec; label: string }> = {
  correct: { spec: iconCorrect, label: copy.study.resultStatusCorrect },
  incorrect: { spec: iconWrong, label: copy.study.resultStatusIncorrect },
  pass: { spec: iconPass, label: copy.study.pass },
  unanswered: { spec: iconUnanswered, label: copy.study.unansweredLabel },
};

function statusOf(item: StudyPerItem): StatusKey {
  if (item.responseKind === 'pass') return 'pass';
  if (item.responseKind === 'unanswered') return 'unanswered';
  return item.correct ? 'correct' : 'incorrect';
}

interface Props {
  perItem: StudyPerItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

// 결과 요약 아래 문항 목록 — 선택하면 같은 화면의 기존 페이저 상세를 그 문항으로 옮긴다(#132).
export function ResultQuestionList({ perItem, currentIndex, onSelect }: Props) {
  const headingId = useId();
  const hintId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  // 방향키·Home·End — 기존 페이저와 같은 방식으로 선택과 포커스를 함께 옮긴다.
  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const last = perItem.length - 1;
    let next = from;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(from + 1, last);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(from - 1, 0);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    if (next === from) return;
    onSelect(next);
    refs.current[next]?.focus();
  };

  return (
    <nav
      className="moi-study-question-list"
      aria-labelledby={headingId}
      aria-describedby={hintId}
    >
      <h2 id={headingId} className="moi-study-question-list-title">
        {copy.study.resultQuestionList}
      </h2>
      <p id={hintId} className="moi-note moi-study-question-list-hint">
        {copy.study.resultQuestionListHint}
      </p>
      <ol className="moi-study-question-items">
        {perItem.map((item, index) => {
          const statusKey = statusOf(item);
          const status = STATUS[statusKey];
          const StatusIcon = status.spec.icon;
          return (
            <li key={item.questionId}>
              <button
                ref={(el) => {
                  refs.current[index] = el;
                }}
                type="button"
                className="moi-study-question-item"
                data-status={statusKey}
                aria-current={index === currentIndex ? 'step' : undefined}
                aria-label={`${copy.study.questionLabel} ${index + 1}: ${status.label}`}
                onClick={() => onSelect(index)}
                onKeyDown={(event) => move(event, index)}
              >
                <span className="moi-study-question-number">{index + 1}</span>
                <span className="moi-study-question-status">
                  <span className="moi-study-question-status-symbol" aria-hidden="true">
                    <StatusIcon
                      size={status.spec.size}
                      aria-hidden="true"
                      focusable="false"
                    />
                  </span>
                  {status.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
