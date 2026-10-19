import { useState } from 'react';
import type { ApiClient } from '../api/client';
import { HistoryView } from '../study/HistoryView';
import { useStudyHistory } from '../study/queries';

// 이력 — HistoryView 재사용. page는 로컬 state. 0건이면 페이지 표기를 숨긴다.
export function HistoryPage({ client }: { client: ApiClient }) {
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const query = useStudyHistory(client, page, 20, true);
  return (
    <div className="moi-page">
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
