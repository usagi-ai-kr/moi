import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ApiClient } from '../api/client';
import { HistoryView } from '../study/HistoryView';
import { useStudyHistory } from '../study/queries';
import { HISTORY_PAGE_SIZE, STUDY_EXAM_ID } from '../study/types';
import { StatsPanel } from '../stats/StatsPanel';

function parsePageParam(raw: string | null): { page: number; isInvalid: boolean } {
  if (raw === null) return { page: 1, isInvalid: false };
  if (!/^\d+$/.test(raw)) return { page: 1, isInvalid: true };
  const n = Number(raw);
  if (n < 1 || n > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(n)) {
    return { page: 1, isInvalid: true };
  }
  return { page: n, isInvalid: false };
}

// 학습 현황/이력 — URL searchParams('page')를 단일 진실 원천으로 삼는다 (이슈 #148).
export function HistoryPage({ client }: { client: ApiClient }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPage = searchParams.get('page');
  const { page, isInvalid } = parsePageParam(rawPage);

  const [detailId, setDetailId] = useState<string | null>(null);

  const handleOpenDetail = (setId: string) => {
    void navigate('/history/detail', { state: { setId, page } });
  };

  // 잘못된 page param (0, 음수, 소수, 문자, 안전정수 밖) 은 1로 replace
  useEffect(() => {
    if (rawPage !== null && isInvalid) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
    }
  }, [rawPage, isInvalid, setSearchParams]);

  // 페이지 변경 시 이전 상세 해제
  useEffect(() => {
    setDetailId(null);
  }, [page]);

  const query = useStudyHistory(client, page, HISTORY_PAGE_SIZE, true);

  // 서버 확정 결과로만 out-of-range 보정, 이전 placeholder total로 조기보정 금지
  useEffect(() => {
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
  }, [query.data, query.isPlaceholderData, query.isSuccess, page, setSearchParams]);

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
      <StatsPanel client={client} examId={STUDY_EXAM_ID} />
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
    </div>
  );
}
