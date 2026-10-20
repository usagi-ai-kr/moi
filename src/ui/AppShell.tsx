import { Link, NavLink, Outlet } from 'react-router';
import { copy } from './copy';
import { prefetchRoute } from './lazy-routes';
import './shell.css';

// NavLink 청크를 hover/focus/touch 시점에 미리 받아 라우트 전환 시 로딩 폴백을 줄인다 (#184).
function prefetchOnIntent(to: '/history' | '/review' | '/account') {
  return {
    onMouseEnter: () => prefetchRoute(to),
    onFocus: () => prefetchRoute(to),
    onTouchStart: () => prefetchRoute(to),
  };
}

// 로그인 후 셸 — header(브랜드+nav) + main(Outlet). NavLink가 aria-current="page"를 부여한다.
export function AppShell() {
  return (
    <>
      <header className="moi-header moi-shell-header">
        <div className="moi-container moi-shell-head">
          <Link to="/" className="moi-brand-link" aria-label={copy.brand}>
            <span className="moi-brand">{copy.brand}</span>
          </Link>
          <nav className="moi-nav" aria-label={copy.nav.label}>
            <NavLink to="/" end className="moi-nav-link">
              {copy.nav.study}
            </NavLink>
            <NavLink to="/history" className="moi-nav-link" {...prefetchOnIntent('/history')}>
              {copy.nav.history}
            </NavLink>
            <NavLink to="/review" className="moi-nav-link" {...prefetchOnIntent('/review')}>
              {copy.nav.review}
            </NavLink>
            <NavLink to="/account" className="moi-nav-link" {...prefetchOnIntent('/account')}>
              {copy.nav.account}
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="moi-main moi-shell-main">
        <div className="moi-container moi-main-inner moi-enter">
          <Outlet />
        </div>
      </main>
    </>
  );
}
