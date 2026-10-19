import { Link, NavLink, Outlet } from 'react-router';
import { copy } from './copy';

// 로그인 후 셸 — header(브랜드+nav) + main(Outlet). NavLink가 aria-current="page"를 부여한다.
export function AppShell() {
  return (
    <>
      <header className="moi-header">
        <div className="moi-container moi-header-inner moi-shell-head">
          <Link to="/" className="moi-brand-link" aria-label={copy.brand}>
            <span className="moi-brand">{copy.brand}</span>
          </Link>
          <nav className="moi-nav" aria-label={copy.nav.label}>
            <NavLink to="/" end className="moi-nav-link">
              {copy.nav.study}
            </NavLink>
            <NavLink to="/history" className="moi-nav-link">
              {copy.nav.history}
            </NavLink>
            <NavLink to="/account" className="moi-nav-link">
              {copy.nav.account}
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="moi-main">
        <div className="moi-container moi-main-inner moi-enter">
          <Outlet />
        </div>
      </main>
    </>
  );
}
