import { Component, type ReactNode } from 'react';
import { Link } from 'react-router';
import { copy } from './copy';

export interface RouteErrorBoundaryProps {
  children: ReactNode;
  resetKey?: unknown;
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
            <Link to="/" className="moi-study-link">
              {copy.common.home}
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
