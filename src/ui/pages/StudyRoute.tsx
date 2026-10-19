import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import type { ApiClient } from '../api/client';
import { copy } from '../copy';
import { StudyScreen } from '../study/StudyScreen';
import { useCurrentStudySet } from '../study/queries';
import { useStudyUiStore } from '../study/store';
import { STUDY_EXAM_ID } from '../study/types';
import { LoadErrorAlert } from '../widgets';

function StudyLoading() {
  return (
    <p className="moi-note" role="status" aria-live="polite">
      {copy.session.checking}
    </p>
  );
}

// 학습 라우트 래퍼 — 주소창의 세트 UUID 없이 route mode에 따라 store view를 설정한다 (#148).
// /study는 current API로 진행 중 세트를 찾고, /study/result는 제출 시 전달한 state만 사용한다.
export function StudyRoute({
  client,
  userId,
  mode,
}: {
  client: ApiClient;
  userId: string;
  mode: 'start' | 'current' | 'result';
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const setView = useStudyUiStore((s) => s.setView);
  const current = useCurrentStudySet(client, STUDY_EXAM_ID, userId, mode === 'current');
  const state = location.state as { setId?: unknown } | null;
  const resultSetId = typeof state?.setId === 'string' ? state.setId : null;

  useEffect(() => {
    if (mode === 'start') setView('start');
    else if (mode === 'result') setView('result');
    else setView('active');
  }, [mode, setView]);

  if (mode === 'result' && !resultSetId) return <Navigate to="/history" replace />;

  if (mode === 'current') {
    // 진입 시 이전 캐시(포기·제출한 세트)를 쓰지 않도록 마운트 후 첫 조회만 기다린다.
    // 이후 재조회로 풀이 화면을 언마운트하지 않는다.
    if (current.isPending || !current.isFetchedAfterMount) return <StudyLoading />;
    if (current.isError) return <LoadErrorAlert onRetry={() => void current.refetch()} />;
    if (!current.data) return <Navigate to="/study/new" replace />;
  }

  const initialSetId =
    mode === 'start' ? null : mode === 'result' ? resultSetId : (current.data?.id ?? null);

  return (
    <StudyScreen
      client={client}
      userId={userId}
      initialSetId={initialSetId}
      onNavigate={(to, opts) => navigate(to, opts)}
    />
  );
}
