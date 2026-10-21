import type { StudySummary } from '../api/client';
import { iconHistory } from '../icons';
import { copy } from '../copy';
import { domainLabel } from '../stats/labels';
import { formatDateTime, scopeLabel } from '../study/types';

// 완료 목록의 행 단위 표시 모델 — 표(데스크톱)와 카드(모바일)가 함께 쓰는 값·서체 규칙.
// 숫자 셀(완료일·정답률·문항 수)만 고정폭 서체, 한국어 범위명·헤더·단위는 본문 서체를 유지한다 (#224).

export interface RowModel {
  item: StudySummary;
  id: string;
  dateText: string;
  /** 날짜를 알 수 없으면 formatDateTime이 알려 주는 문구로 되돌린다 — 1970 오표기 방지. */
  dateMissing: boolean;
  scopeText: string;
  accuracyText: string;
  countText: string;
}

export function toRow(item: StudySummary): RowModel {
  const dateText = formatDateTime(item.submittedAt);
  return {
    item,
    id: item.id,
    dateText,
    dateMissing: dateText === copy.study.unknownDate,
    scopeText: copy.history.scopeWithDomain(
      scopeLabel(item.mode),
      item.domainId ? domainLabel(item.domainId) : null,
    ),
    accuracyText: copy.history.accuracyValue(item.accuracyPercent),
    countText: copy.history.questionCountValue(item.correctCount),
  };
}

/** 완료일 — 값이 있을 때만 고정폭 숫자 서체, 모르는 날짜는 본문 서체를 유지한다. */
export function DateValue({ row }: { row: RowModel }) {
  if (row.dateMissing) return <span className="moi-history-unknown">{row.dateText}</span>;
  return <span className="moi-history-num">{row.dateText}</span>;
}

/** 숫자 값 — tabular-nums + 고정폭 서체(단위 한글은 서체 폴백으로 본문 서체 유지). */
export function NumValue({ text }: { text: string }) {
  return <span className="moi-history-num">{text}</span>;
}

export function DetailAction({ row, onDetail }: { row: RowModel; onDetail: (id: string) => void }) {
  return (
    <button
      type="button"
      className="moi-study-link moi-history-detail-action"
      // 행이 여러 개여도 스크린리더가 어느 행인지 구분한다 (보이는 라벨 "상세 보기" 포함).
      aria-label={`${row.dateText} ${copy.study.detail}`}
      onClick={() => onDetail(row.id)}
    >
      <iconHistory.icon aria-hidden="true" size={iconHistory.size} className="mr-1" />
      {copy.study.detail}
    </button>
  );
}
