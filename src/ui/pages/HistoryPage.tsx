import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ApiClient } from '../api/client';
import { copy } from '../copy';
import { HistoryTabs } from '../history/HistoryTabs';
import { resolveHistoryTab, type HistoryTab } from '../history/history-tab-state';
import { StatsDomainsPanel } from '../stats/StatsDomainsPanel';
import { StatsSummaryPanel } from '../stats/StatsSummaryPanel';
import { HistoryView } from '../study/HistoryView';
import { useStudyHistory } from '../study/queries';
import { HISTORY_PAGE_SIZE, STUDY_EXAM_ID } from '../study/types';

function parsePageParam(raw: string | null): { page: number; isInvalid: boolean } {
  if (raw === null) return { page: 1, isInvalid: false };
  if (!/^\d+$/.test(raw)) return { page: 1, isInvalid: true };
  const n = Number(raw);
  if (n < 1 || n > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(n)) {
    return { page: 1, isInvalid: true };
  }
  return { page: n, isInvalid: false };
}

// 학습 현황/이력 — ?tab=(summary|domains|completed)이 단일 진실 원천 (#224).
// ?page=는 completed 탭에서만 의미를 가지며 탭 전환 시에도 보존한다.
export function HistoryPage({ client }: { client: ApiClient }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const rawPage = searchParams.get('page');
  const { tab: activeTab, needsReplace } = resolveHistoryTab(rawTab, rawPage);
  const { page, isInvalid } = parsePageParam(rawPage);
  const isCompleted = activeTab === 'completed';

  const [detailId, setDetailId] = useState<string | null>(null);

  const handleOpenDetail = (setId: string) => {
    void navigate('/history/detail', { state: { setId, page } });
  };

  const handleTabChange = (next: HistoryTab) => {
    setDetailId(null);
    // 사용자 탭 이동은 push (뒤로가기로 탭 복원), page는 보존한다.
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set('tab', next);
      return nextParams;
    });
  };

  // tab 해석 정규화 — 잘못된 tab은 summary로, tab 없는 page 링크는 completed로 replace.
  useEffect(() => {
    if (needsReplace) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', activeTab);
          return next;
        },
        { replace: true },
      );
    }
  }, [needsReplace, activeTab, setSearchParams]);

  // 잘못된 page param은 completed 탭에서만 1로 replace (숨은 탭이 URL을 바꾸지 않는다).
  useEffect(() => {
    if (isCompleted && rawPage !== null && isInvalid) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
    }
  }, [isCompleted, rawPage, isInvalid, setSearchParams]);

  // 페이지 변경 시 이전 상세 해제
  useEffect(() => {
    setDetailId(null);
  }, [page]);

  // 이력 조회는 completed 탭에서만 활성 — 요약/분석 탭에서는 /api/study/sets 미발생.
  const query = useStudyHistory(client, page, HISTORY_PAGE_SIZE, isCompleted);

  // 서버 확정 결과로만 out-of-range 보정, 이전 placeholder total로 조기보정 금지.
  // 이력 query가 disabled여도 캐시 isSuccess가 남으므로 completed 탭에서만 실행한다.
  useEffect(() => {
    if (!isCompleted) return;
    if (query.isPlaceholderData || !query.isSuccess || !query.data) return;

    const total = query.data.total;
    if (total === 0 && page !== 1) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
      return;
    }

    if (total > 0) {
      const maxPage = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
      if (page > maxPage) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('page', String(maxPage));
            return next;
          },
          { replace: true },
        );
      }
    }
  }, [isCompleted, query.data, query.isPlaceholderData, query.isSuccess, page, setSearchParams]);

  const handlePageChange = (newPage: number) => {
    setDetailId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(newPage));
      return next;
    });
  };

  return (
    <div className="moi-page">
      <h1 className="moi-title">{copy.nav.history}</h1>
      <HistoryTabs
        value={activeTab}
        onChange={handleTabChange}
        summary={<StatsSummaryPanel client={client} examId={STUDY_EXAM_ID} />}
        domains={<StatsDomainsPanel client={client} examId={STUDY_EXAM_ID} />}
        completed={
          <HistoryView
            items={query.data?.items ?? []}
            total={query.data?.total ?? 0}
            page={page}
            pageSize={HISTORY_PAGE_SIZE}
            pending={query.isPending}
            isFetching={query.isFetching}
            loadError={query.isError}
            detailId={query.isError ? null : detailId}
            onPage={handlePageChange}
            onDetail={setDetailId}
            onOpenDetail={handleOpenDetail}
            onRetry={() => void query.refetch()}
            hidePagerWhenEmpty
          />
        }
      />
    </div>
  );
}
