import { Fragment } from 'react';
import type { StudySummary } from '../api/client';
import { copy } from '../copy';
import { useMediaQuery } from '../responsive';
import { breakpoints } from '../tokens';
import { HistoryDetailDialog } from './CompletedHistoryDetail';
import { DateValue, DetailAction, NumValue, toRow, type RowModel } from './CompletedHistoryRow';
import './history.css';

// 완료한 학습 목록 — 데스크톱(≥768px)은 의미 있는 표(thead/th scope="col"), 모바일(≤767px)은
// 라벨-값 카드(dl)로 재구성한다. 고정폭 표를 억지 축소하거나 가로 오버플로를 숨기지 않는다 (#224).
/** 모바일(≤767px) 구간 — 라벨-값 카드로 전환한다. */
export const COMPACT_HISTORY_QUERY = `(max-width: ${breakpoints.tablet - 1}px)`;

export interface CompletedHistoryListProps {
  items: StudySummary[];
  detailId: string | null;
  page: number;
  onDetail: (id: string | null) => void;
  onOpenDetail?: (id: string) => void;
}

function CompletedHistoryTable({
  rows,
  detailId,
  page,
  onDetail,
  onOpenDetail,
}: CompletedHistoryListProps & { rows: RowModel[] }) {
  return (
    <table className="moi-history-table">
      <caption className="moi-sr-only">{copy.history.completedTableCaption}</caption>
      <thead>
        <tr>
          <th scope="col" className="moi-history-col-date">
            {copy.history.completedColumnDate}
          </th>
          <th scope="col" className="moi-history-col-scope">
            {copy.history.completedColumnScope}
          </th>
          <th scope="col" className="moi-history-col-accuracy">
            {copy.history.completedColumnAccuracy}
          </th>
          <th scope="col" className="moi-history-col-count">
            {copy.history.completedColumnCount}
          </th>
          <th scope="col" className="moi-history-col-detail">
            {copy.study.detail}
          </th>
        </tr>
      </thead>      <tbody>
        {rows.map((row) => (
          <Fragment key={row.id}>
            <tr className="moi-history-row">
              <td className="moi-history-cell moi-history-cell-num">
                <DateValue row={row} />
              </td>
              <td className="moi-history-cell">{row.scopeText}</td>
              <td className="moi-history-cell moi-history-cell-num">
                <NumValue text={row.accuracyText} />
              </td>
              <td className="moi-history-cell moi-history-cell-num">
                <NumValue text={row.countText} />
              </td>
              <td className="moi-history-cell moi-history-cell-detail">
                <DetailAction row={row} onDetail={onDetail} />
              </td>
            </tr>
            {detailId === row.id && (
              <tr className="moi-history-detail-row">
                <td colSpan={5} className="moi-history-detail-cell">
                  <HistoryDetailDialog
                    item={row.item}
                    page={page}
                    onClose={() => onDetail(null)}
                    onOpenDetail={onOpenDetail}
                  />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function CompletedHistoryCards({
  rows,
  detailId,
  page,
  onDetail,
  onOpenDetail,
}: CompletedHistoryListProps & { rows: RowModel[] }) {
  return (
    <ul className="moi-history-cards">
      {rows.map((row) => (
        <li key={row.id} className="moi-history-card">
          <dl className="moi-history-card-list">
            <div className="moi-history-card-row">
              <dt className="moi-history-card-label">{copy.history.completedColumnDate}</dt>
              <dd className="moi-history-card-value moi-history-cell-num">
                <DateValue row={row} />
              </dd>
            </div>
            <div className="moi-history-card-row">
              <dt className="moi-history-card-label">{copy.history.completedColumnScope}</dt>
              <dd className="moi-history-card-value">{row.scopeText}</dd>
            </div>
            <div className="moi-history-card-row">
              <dt className="moi-history-card-label">{copy.history.completedColumnAccuracy}</dt>
              <dd className="moi-history-card-value moi-history-cell-num">
                <NumValue text={row.accuracyText} />
              </dd>
            </div>
            <div className="moi-history-card-row">
              <dt className="moi-history-card-label">{copy.history.completedColumnCount}</dt>
              <dd className="moi-history-card-value moi-history-cell-num">
                <NumValue text={row.countText} />
              </dd>
            </div>
          </dl>
          <DetailAction row={row} onDetail={onDetail} />
          {detailId === row.id && (
            <HistoryDetailDialog
              item={row.item}
              page={page}
              onClose={() => onDetail(null)}
              onOpenDetail={onOpenDetail}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

// 완료 목록 — 뷰포트에 따라 표(데스크톱) 또는 라벨-값 카드(모바일) 중 하나만 그린다.
export function CompletedHistoryList(props: CompletedHistoryListProps) {
  const isCompact = useMediaQuery(COMPACT_HISTORY_QUERY);
  // 항목이 없으면 빈 표·빈 카드를 그리지 않는다 (로딩 스켈레톤·빈 안내가 대신 보인다).
  if (props.items.length === 0) return null;
  const rows = props.items.map(toRow);
  const view = { ...props, rows };
  return isCompact ? (
    <CompletedHistoryCards {...view} />
  ) : (
    <CompletedHistoryTable {...view} />
  );
}
