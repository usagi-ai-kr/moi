import { useState } from 'react';
import type { ApiClient } from '../api/client';
import { HistoryView } from '../study/HistoryView';
import { useStudyHistory } from '../study/queries';
import { STUDY_EXAM_ID } from '../study/types';
import { StatsPanel } from '../stats/StatsPanel';

// 학습 현황/이력 — 통계는 상단의 독립 섹션, 완료 세트 목록은 아래 목록 섹션으로 분리한다.
// page는 로컬 state. 0건이면 페이지 표기를 숨긴다.
export function HistoryPage({ client }: { client: ApiClient }) {
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const query = useStudyHistory(client, page, 20, true);
  return (
    <div className="moi-page">
      <StatsPanel client={client} examId={STUDY_EXAM_ID} />
      <HistoryView
        items={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={page}
        pageSize={20}
        pending={query.isPending}
        loadError={query.isError}
        detailId={detailId}
        onPage={setPage}
        onDetail={setDetailId}
        onRetry={() => void query.refetch()}
        hidePagerWhenEmpty
      />
    </div>
  );
}
