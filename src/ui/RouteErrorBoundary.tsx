import { Component, type ReactNode } from 'react';
import { copy } from './copy';

export interface RouteErrorBoundaryProps {
  children: ReactNode;
  resetKey?: unknown;
  // 라우터 안쪽 사용처는 client-side 이동을 유지하도록 Link를 넘긴다.
  // 넘기지 않으면 라우터 없이도 동작하는 <a href="/">를 렌더한다.
  homeLink?: ReactNode;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
}

// lazy 청크 로드 실패(새 배포 404, 네트워크 단절 등) 공통 경계 (#148).
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  override state: RouteErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidUpdate(prevProps: RouteErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="moi-page" role="alert">
          <p className="moi-note">{copy.common.routeError}</p>
          <div className="moi-study-cta-row">
            <button
              type="button"
              className="moi-study-open"
              onClick={() => {
                if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
                  window.location.reload();
                }
              }}
            >
              {copy.common.reload}
            </button>
            {this.props.homeLink ?? (
              <a href="/" className="moi-study-link">
                {copy.common.home}
              </a>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
