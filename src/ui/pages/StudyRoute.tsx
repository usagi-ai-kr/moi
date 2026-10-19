import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { ApiClient } from '../api/client';
import { StudyScreen } from '../study/StudyScreen';
import { useStudyUiStore } from '../study/store';

// 학습 라우트 래퍼 — route mode에 따라 store view를 설정하고 StudyScreen에 연결한다 (#148).
export function StudyRoute({
  client,
  userId,
  mode,
}: {
  client: ApiClient;
  userId: string;
  mode: 'start' | 'active' | 'result';
}) {
  const params = useParams();
  const navigate = useNavigate();
  const setView = useStudyUiStore((s) => s.setView);
  const setIdParam = (params as { setId?: string }).setId ?? null;

  useEffect(() => {
    if (mode === 'start') setView('start');
    else if (mode === 'active') setView('active');
    else setView('result');
  }, [mode, setView]);

  const initialSetId = mode === 'start' ? null : setIdParam;
  return (
    <StudyScreen
      client={client}
      userId={userId}
      initialSetId={initialSetId}
      onNavigate={(to, opts) => navigate(to, opts)}
    />
  );
}
