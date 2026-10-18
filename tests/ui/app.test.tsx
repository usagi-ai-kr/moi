import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App';

describe('App (스캐폴드 스모크)', () => {
  it('홈 제목을 렌더링한다', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('moi');
  });
});
