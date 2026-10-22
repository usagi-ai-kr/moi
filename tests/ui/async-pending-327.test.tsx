import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { KakaoLoginButton } from '../../src/ui/KakaoLoginButton';
import { LogoutAction } from '../../src/ui/LogoutAction';
import { StartView } from '../../src/ui/study/StartView';

// client 사용처 없음 — 타입 전용 참조 제거.

describe('327 비동기 pending 표시', () => {
  it('카카오 로그인 버튼은 클릭 시 pending 라벨/aria-busy 를 표시한다', () => {
    render(<KakaoLoginButton />);
    const link = screen.getByRole('link', { name: /카카오 로그인/i });
    // jsdom에서는 실제 네비게이션이 일어나지 않으므로 클릭 후 상태를 확인한다.
    fireEvent.click(link);
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveTextContent('로그인 중…');
  });

  it('로그아웃 액션은 pending 시 disabled/aria-busy 를 표시한다', () => {
    render(<LogoutAction className="moi-nav-action" pending onLogout={vi.fn()} />);
    const button = screen.getByRole('button', { name: /로그아웃/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('학습 시작 화면은 pending 시 컨트롤을 비활성화한다', () => {
    render(
      <StartView
        pending
        scope="all"
        domainId="dom-security"
        size={4}
        conflict={false}
        unauthorized={false}
        startError={null}
        onScope={vi.fn()}
        onDomain={vi.fn()}
        onSize={vi.fn()}
        onStart={vi.fn()}
        onResume={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.some((b) => b.hasAttribute('disabled'))).toBe(true);
  });
});