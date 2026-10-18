import { copy } from './copy';

// 화면 구성 요소 — 문구는 copy.ts, 스타일 값은 tokens.ts(CSS 변수)만 사용 (ADR-0012).
// 정적 텍스트는 시맨틱 HTML로 렌더한다 — AntD는 상호작용 컴포넌트가 있는 화면(#4)부터 사용(초기 번들 최소화).
export function App() {
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
          <h1 className="moi-title">{copy.brand}</h1>
          <p className="moi-lead">{copy.tagline}</p>
          <p className="moi-note">{copy.home.note}</p>
        </div>
      </main>
    </>
  );
}
