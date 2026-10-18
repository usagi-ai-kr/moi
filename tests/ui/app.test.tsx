import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App';

describe('App (스캐폴드 스모크)', () => {
  it('홈 제목을 렌더링한다', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('moi');
  });

  it('카카오 로그인 버튼이 공식 진입점(/auth/kakao)으로 연결된다', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: '카카오 로그인' });
    expect(link).toHaveAttribute('href', '/auth/kakao');
  });
});
