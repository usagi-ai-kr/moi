import { Suspense, lazy } from 'react';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useInRouterContext,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { copy } from './copy';
import { KakaoLoginButton } from './KakaoLoginButton';
import { useAuthCallback, useLogout, useSessionId, useUiStore, type ApiClient } from './session';
import { AppShell } from './AppShell';
import { AccountPage } from './pages/AccountPage';
import { HistoryPage } from './pages/HistoryPage';
import { AuthErrorAlert, LoadErrorAlert } from './widgets';

// 학습 화면은 lazy 청크로 홈 초기 번들/LCP에 포함하지 않는다 (이슈 #50, #148).
const StudyRoute = lazy(() => import('./pages/StudyRoute').then((m) => ({ default: m.StudyRoute })));
const HistoryDetailPage = lazy(() =>
  import('./pages/HistoryDetailPage').then((m) => ({ default: m.HistoryDetailPage })),
);

function StudyFallback() {
  return (
    <p className="moi-note" role="status" aria-live="polite">
      {copy.session.checking}
    </p>
  );
}

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

// 로그인 홈 — 계정·통계·로그아웃은 각자의 화면/메뉴로 이동한다.
// CTA는 라우터로 이동해 뒤로가기/새로고침/직접 URL을 유지한다.
function Home({ showAuthError }: { showAuthError: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const legacyStudy = params.get('study');
  // legacy: 기존 /?study=<UUID> 북마크는 /study/<UUID>로 replace (#148).
  if (legacyStudy) return <Navigate to={`/study/${legacyStudy}`} replace />;
  return (
    <div className="moi-page">
      {showAuthError && <AuthErrorAlert />}
      <p className="moi-lead">{copy.session.welcome}</p>
      <div className="moi-cta moi-study-cta-row">
        <button type="button" className="moi-study-open" onClick={() => void navigate('/study/new')}>
          {copy.study.cta}
        </button>
        <button type="button" className="moi-study-link" onClick={() => void navigate('/history')}>
          {copy.study.historyLink}
        </button>
      </div>
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
  const logoutPending = useUiStore((s) => s.logoutPending);
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
        <Route index element={<Home showAuthError={showAuthError} />} />
        <Route path="study" element={<Navigate to="/study/new" replace />} />
        <Route
          path="study/new"
          element={
            <Suspense key={userId} fallback={<StudyFallback />}>
              <StudyRoute client={client} userId={userId} mode="start" />
            </Suspense>
          }
        />
        <Route
          path="study/:setId"
          element={
            <Suspense key={userId} fallback={<StudyFallback />}>
              <StudyRoute client={client} userId={userId} mode="active" />
            </Suspense>
          }
        />
        <Route
          path="study/:setId/result"
          element={
            <Suspense key={userId} fallback={<StudyFallback />}>
              <StudyRoute client={client} userId={userId} mode="result" />
            </Suspense>
          }
        />
        <Route path="history" element={<HistoryPage client={client} />} />
        <Route
          path="history/:setId"
          element={
            <Suspense fallback={<StudyFallback />}>
              <HistoryDetailPage client={client} />
            </Suspense>
          }
        />
        <Route path="account" element={<AccountPage pending={logoutPending} onLogout={doLogout} />} />
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
