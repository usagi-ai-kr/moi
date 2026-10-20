import { Link, Navigate, useParams } from 'react-router';
import { isSubmittedSet, type ApiClient } from '../api/client';
import { copy } from '../copy';
import { RouteFallback } from '../RouteFallback';
import { useStudySet } from '../study/queries';

// 레거시 학습 주소 호환 (#148) — /study/:setId, /study/:setId/result, /?study=<id>.
// 서버가 소유권을 검증한 GET 결과로만 이동하며, 실패 화면에는 세트 UUID를 출력하지 않는다.
export function LegacyStudyRedirect({ client, setId }: { client: ApiClient; setId?: string }) {
  const params = useParams();
  const id = setId ?? (params as { setId?: string }).setId ?? null;
  const query = useStudySet(client, id);

  if (id === null || query.isError) return <LegacyUnavailable />;

  if (query.isPending) {
    return <RouteFallback variant="detail" />;
  }

  const set = query.data;
  if (!set) return <LegacyUnavailable />;
  if (isSubmittedSet(set)) {
    return <Navigate to="/study/result" replace state={{ setId: set.id }} />;
  }
  if (set.status === 'active') return <Navigate to="/study" replace />;
  return <LegacyUnavailable />;
}

function LegacyUnavailable() {
  return (
    <div className="moi-page" role="alert">
      <p className="moi-note">{copy.study.notFoundSet}</p>
      <p className="moi-note">이전 학습 주소는 더 이상 사용할 수 없습니다.</p>
      <div className="moi-cta moi-study-cta-row">
        <Link className="moi-study-link" to="/study/new">
          {copy.study.backToStart}
        </Link>
        <Link className="moi-study-link" to="/history">
          {copy.study.historyLink}
        </Link>
      </div>
    </div>
  );
}
