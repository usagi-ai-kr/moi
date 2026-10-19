import { Suspense, lazy, useState } from 'react';
import { MemoryRouter, Route, Routes, useInRouterContext, useNavigate } from 'react-router';
import { copy } from './copy';
import { KakaoLoginButton } from './KakaoLoginButton';
import { useAuthCallback, useLogout, useSessionId, useUiStore, type ApiClient } from './session';
import { STUDY_EXAM_ID } from './study/types';
import { StatsPanel } from './stats/StatsPanel';
import { AppShell } from './AppShell';
import { AccountPage } from './pages/AccountPage';
import { HistoryPage } from './pages/HistoryPage';
import { AuthErrorAlert, LoadErrorAlert } from './widgets';

// 학습 화면은 lazy 청크로 홈 초기 번들/LCP에 포함하지 않는다 (이슈 #50).
const StudyScreen = lazy(() =>
  import('./study/StudyScreen').then((m) => ({ default: m.StudyScreen })),
);

function CheckingView() {
  return (
    <div className="moi-center" role="status" aria-live="polite">
      <span className="moi-spinner" aria-hidden="true" />
      <p className="moi-note">{copy.session.checking}</p>
    </div>
  );
}

function LoggedOutView({
  status,
  onRetry,
  showAuthError,
}: {
  status: 'loading' | 'error' | 'logged-out' | 'logged-in';
  onRetry: () => void;
  showAuthError: boolean;
}) {
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
          {showAuthError && <AuthErrorAlert />}
          <h1 className="moi-title">{copy.brand}</h1>
          <p className="moi-lead">{copy.tagline}</p>
          {status === 'loading' && <CheckingView />}
          {status === 'error' && <LoadErrorAlert onRetry={onRetry} />}
          {status === 'logged-out' && (
            <div className="moi-cta">
              <KakaoLoginButton />
            </div>
          )}
          <p className="moi-note">{copy.home.note}</p>
        </div>
      </main>
    </>
  );
}

// 로그인 홈 — 계정 카드는 노출하지 않는다. CTA는 라우터로 이동해 뒤로가기/새로고침을 유지한다.
function Home({
  client,
  doLogout,
  showAuthError,
}: {
  client: ApiClient;
  doLogout: () => Promise<void>;
  showAuthError: boolean;
}) {
  const navigate = useNavigate();
  const logoutPending = useUiStore((s) => s.logoutPending);
  const [statsOpen, setStatsOpen] = useState(false);
  return (
    <div className="moi-page">
      {showAuthError && <AuthErrorAlert />}
      <p className="moi-lead">{copy.session.welcome}</p>
      <div className="moi-cta moi-study-cta-row">
        <button type="button" className="moi-study-open" onClick={() => void navigate('/study')}>
          {copy.study.cta}
        </button>
        <button type="button" className="moi-study-link" onClick={() => void navigate('/history')}>
          {copy.study.historyLink}
        </button>
        <button
          type="button"
          className="moi-study-link"
          aria-expanded={statsOpen}
          onClick={() => setStatsOpen((v) => !v)}
        >
          {copy.stats.toggle}
        </button>
        <button
          type="button"
          className="moi-study-link"
          disabled={logoutPending}
          aria-busy={logoutPending}
          onClick={() => void doLogout()}
        >
          {logoutPending ? copy.session.loggingOut : copy.session.logout}
        </button>
      </div>
      {statsOpen && <StatsPanel client={client} examId={STUDY_EXAM_ID} />}
    </div>
  );
}

function NotFound() {
  return (
    <div className="moi-page">
      <p className="moi-note">페이지를 찾을 수 없습니다.</p>
      <a className="moi-study-link" href="/">
        {copy.nav.study}
      </a>
    </div>
  );
}

function AppContent({ client }: { client: ApiClient }) {
  const { status, userId, retry } = useSessionId(client);
  const doLogout = useLogout(client, userId);
  const authFailed = useAuthCallback('error');
  useAuthCallback('success');
  const bannerDismissed = useUiStore((s) => s.authBannerDismissed);
  const showAuthError = authFailed && !bannerDismissed;
  if (status !== 'logged-in' || userId === null) {
    return <LoggedOutView status={status} onRetry={retry} showAuthError={showAuthError} />;
  }
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home client={client} doLogout={doLogout} showAuthError={showAuthError} />} />
        <Route
          path="study"
          element={
            <Suspense
              key={userId}
              fallback={
                <p className="moi-note" role="status" aria-live="polite">
                  {copy.session.checking}
                </p>
              }
            >
              <StudyScreen client={client} userId={userId} />
            </Suspense>
          }
        />
        <Route path="history" element={<HistoryPage client={client} />} />
        <Route path="account" element={<AccountPage client={client} />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

// 테스트·구버전 진입 호환 — Router 없이 렌더되면 MemoryRouter로 감싼다.
export function App({ client }: { client: ApiClient }) {
  const inRouter = useInRouterContext();
  if (inRouter) return <AppContent client={client} />;
  return (
    <MemoryRouter>
      <AppContent client={client} />
    </MemoryRouter>
  );
}
