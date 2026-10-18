import { Suspense, lazy, useState } from 'react';
import { copy } from './copy';
import { KakaoLoginButton } from './KakaoLoginButton';
import { useAuthCallback, useLogout, useSessionId, useUiStore, type ApiClient } from './session';
import { STUDY_EXAM_ID } from './study/types';
import { StatsPanel } from './stats/StatsPanel';
import { useStudyUiStore } from './study/store';
import { AuthErrorAlert, LoadErrorAlert, LoggedInCard } from './widgets';

// 학습 화면은 lazy 청크로 분리 — 홈 초기 번들/LCP에 포함하지 않는다 (이슈 #50).
const StudyScreen = lazy(() =>
  import('./study/StudyScreen').then((m) => ({ default: m.StudyScreen })),
);

// 경량 CSS 스피너 로딩 화면 — AntD Spin을 쓰지 않는다 (perf).
function CheckingView() {
  return (
    <div className="moi-center" role="status" aria-live="polite">
      <span className="moi-spinner" aria-hidden="true" />
      <p className="moi-note">{copy.session.checking}</p>
    </div>
  );
}

// 서버 진실 원천(/api/me) 기반 5개 상태 화면 (ADR-0018).
// client 주입 가능 — 테스트에서 가짜 클라이언트로 교체한다.
export function App({ client }: { client: ApiClient }) {
  const { status, userId, retry } = useSessionId(client);
  const doLogout = useLogout(client, userId);
  const logoutPending = useUiStore((s) => s.logoutPending);
  const authFailed = useAuthCallback('error');
  useAuthCallback('success');
  const bannerDismissed = useUiStore((s) => s.authBannerDismissed);
  const showAuthError = authFailed && !bannerDismissed;
  const [studyOpen, setStudyOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  const openStudy = (view: 'start' | 'history') => {
    useStudyUiStore.getState().setView(view);
    useStudyUiStore.getState().resetFlow();
    setStudyOpen(true);
  };

  return (
    <>
      <header className="moi-header">
        <div className="moi-container moi-header-inner">
          <span className="moi-brand">{copy.brand}</span>
          <span className="moi-brand-sub">{copy.tagline}</span>
        </div>
      </header>
      <main className="moi-main">
        <div className="moi-container moi-main-inner moi-enter">
          <div className="moi-accent" aria-hidden="true" />
          {status === 'loading' && <CheckingView />}
          {status === 'error' && <LoadErrorAlert onRetry={retry} />}
          {showAuthError && <AuthErrorAlert />}
          {status === 'logged-in' && userId !== null ? (
            <>
              <LoggedInCard userId={userId} pending={logoutPending} onLogout={() => void doLogout()} />
              <div className="moi-cta moi-study-cta-row">
                <button
                  type="button"
                  className="moi-study-open"
                  onClick={() => (studyOpen ? setStudyOpen(false) : openStudy('start'))}
                >
                  {studyOpen ? copy.session.dismiss : copy.study.cta}
                </button>
                {!studyOpen && (
                  <button type="button" className="moi-study-link" onClick={() => openStudy('history')}>
                    {copy.study.historyLink}
                  </button>
                )}
                <button
                  type="button"
                  className="moi-study-link"
                  aria-expanded={statsOpen}
                  onClick={() => setStatsOpen((v) => !v)}
                >
                  {copy.stats.toggle}
                </button>
              </div>
              {statsOpen && <StatsPanel client={client} examId={STUDY_EXAM_ID} />}
              {studyOpen && userId !== null && (
                <Suspense
                  key={userId} // 계정 전환 시 remount — 이전 계정 초안·화면 상태를 노출하지 않는다 (이슈 #52)
                  fallback={
                    <p className="moi-note" role="status" aria-live="polite">
                      {copy.session.checking}
                    </p>
                  }
                >
                  <StudyScreen client={client} userId={userId} />
                </Suspense>
              )}
            </>
          ) : (
            status !== 'loading' && (
              <>
                <h1 className="moi-title">{copy.brand}</h1>
                <p className="moi-lead">{copy.tagline}</p>
                <div className="moi-cta">
                  <KakaoLoginButton />
                </div>
                <p className="moi-note">{copy.home.note}</p>
              </>
            )
          )}
        </div>
      </main>
    </>
  );
}
