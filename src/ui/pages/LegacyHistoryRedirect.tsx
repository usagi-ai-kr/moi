import { Link, Navigate, useParams } from 'react-router';
import { isSubmittedSet, type ApiClient } from '../api/client';
import { copy } from '../copy';
import { useStudySet } from '../study/queries';

// 레거시 이력 상세 주소 호환 (#148) — /history/:setId.
// 서버가 소유권을 검증한 GET 결과로만 /history/detail로 이동하며,
// 실패/404 시 화면에는 세트 UUID를 출력하지 않는다.
export function LegacyHistoryRedirect({ client, setId: propSetId }: { client: ApiClient; setId?: string }) {
  const params = useParams();
  const setId = propSetId ?? (params as { setId?: string }).setId ?? null;
  const query = useStudySet(client, setId);

  if (setId === null || query.isError) return <LegacyHistoryUnavailable />;

  if (query.isPending) {
    return (
      <p className="moi-note" role="status" aria-live="polite">
        {copy.common.loading}
      </p>
    );
  }

  const set = query.data;
  if (!set || !isSubmittedSet(set)) return <LegacyHistoryUnavailable />;

  return <Navigate to="/history/detail" replace state={{ setId: set.id }} />;
}

function LegacyHistoryUnavailable() {
  return (
    <div className="moi-page" role="alert">
      <p className="moi-note">{copy.study.notFoundSet}</p>
      <p className="moi-note">이전 이력 주소는 더 이상 사용할 수 없습니다.</p>
      <div className="moi-cta moi-study-cta-row">
        <Link className="moi-study-link" to="/history">
          {copy.study.historyLink}
        </Link>
      </div>
    </div>
  );
}
