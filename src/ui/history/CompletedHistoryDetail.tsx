import { Link, useInRouterContext } from 'react-router';
import type { StudySummary } from '../api/client';
import { copy } from '../copy';
import { domainLabel } from '../stats/labels';
import { examLabel, formatDateTime, scopeLabel } from '../study/types';

// 완료 이력 상세 — 요약 대화상자와 상세 보기 액션.
// 학습 화면 이력(HistoryView 인라인 목록)과 학습 현황 완료 탭(컬럼 표)이 함께 쓴다 (#224).
// 라우터 밖에서는 버튼, 안에서는 /history/detail 링크로 동작한다(UUID는 주소창에 노출하지 않는다).

export function HistoryDetailAction({
  setId,
  page,
  onOpenDetail,
}: {
  setId: string;
  page: number;
  onOpenDetail?: (id: string) => void;
}) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <Link
        className="moi-study-link"
        to="/history/detail"
        state={{ setId, page }}
        onClick={(e) => {
          if (onOpenDetail) {
            e.preventDefault();
            onOpenDetail(setId);
          }
        }}
      >
        {copy.study.detail}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="moi-study-link"
      onClick={() => onOpenDetail?.(setId)}
    >
      {copy.study.detail}
    </button>
  );
}

// 요약 대화상자 — 시험·범위·영역·완료일과 상세 보기/닫기 액션.
export function HistoryDetailDialog({
  item,
  page,
  onClose,
  onOpenDetail,
}: {
  item: StudySummary;
  page: number;
  onClose: () => void;
  onOpenDetail?: (id: string) => void;
}) {
  const dateText = formatDateTime(item.submittedAt);
  // 시험 표시는 이력 항목이 소유한 시험 기준 — 선택 시험과 무관할 수 있다 (ADR-0068).
  const examName = examLabel(item.examId);
  return (
    <div className="moi-study-detail" role="dialog" aria-label={copy.history.detailDialogLabel(dateText)}>
      <p className="moi-note">
        {examName ? `${examName} · ` : ''}
        {scopeLabel(item.mode)}
        {item.domainId ? ` · ${domainLabel(item.domainId)}` : ''} · {dateText}
      </p>
      <div className="moi-cta moi-study-cta-row">
        <HistoryDetailAction setId={item.id} page={page} onOpenDetail={onOpenDetail} />
        <button type="button" className="moi-study-ghost" onClick={onClose}>
          {copy.study.close}
        </button>
      </div>
    </div>
  );
}
