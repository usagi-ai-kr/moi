import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HTTPError } from 'ky';
import { readFileSync } from 'node:fs';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { ReviewScreen } from '../../src/ui/review/ReviewScreen';

// #268 Slice 2A — 컨테이너 폭 정렬·셸 포커스 토큰.

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    new Request('http://localhost/api/test'),
    {} as never,
  );
}

function fakeReviewClient(): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        const u = new URL(String(path), 'http://localhost/');
        if (u.pathname === '/api/review/sessions/current') throw httpError(404, { error: 'not_found' });
        if (u.pathname === '/api/review/candidates') {
          return {
            examId: 'saa-c03',
            mode: 'wrong',
            total: 2,
            items: [0, 1].map((i) => ({
              questionId: `q-${i}`,
              validWrongCount: 1,
              stem: `stem-${i}`,
              options: [{ optionId: 'o1', text: '보기 1' }],
            })),
          };
        }
        if (u.pathname === '/api/review/bookmarks') {
          return { examId: 'saa-c03', total: 0, items: [] };
        }
        throw httpError(404, { error: 'not_found' });
      },
    })),
    post: vi.fn(() => ({ json: async () => ({}) })),
    patch: vi.fn(() => ({ json: async () => ({}) })),
  } as unknown as ApiClient;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('#268 Slice 2A 컨테이너 폭 정렬', () => {
  it('복습 화면 루트에 moi-review 클래스가 있다', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/review?mode=wrong']}>
          <Routes>
            <Route path="/review" element={<ReviewScreen client={fakeReviewClient()} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: '복습 대기 2문제' })).toBeInTheDocument();
    expect(container.querySelector('div.moi-page.moi-review')).not.toBeNull();
  });

  it('복습 폭 상한이 학습(.moi-study)과 같은 규칙이다', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toMatch(/\.moi-review\s*\{\s*width:\s*100%;\s*max-width:\s*var\(--moi-kakao-max-w\);/);
    expect(css).toMatch(/@media\s*\(min-width:\s*768px\)\s*\{\s*\.moi-review\s*\{\s*max-width:\s*640px;\s*margin-inline:\s*auto;/);
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)\s*\{\s*\.moi-review\s*\{\s*max-width:\s*100%;/);
    // 전체 .moi-page는 좁히지 않는다.
    expect(css).toMatch(/\.moi-page\s*\{[^}]*max-width:\s*100%/);
  });
});

describe('#268 Slice 2A 셸 포커스 토큰 통일', () => {
  it('셸·셀렉트 focus-visible이 ring-2(box-shadow) 체계다', () => {
    const shell = readFileSync('src/ui/shell.css', 'utf8');
    for (const sel of ['moi-brand-link', 'moi-nav-link', 'moi-logout-action', 'moi-logout-retry']) {
      const block = shell.match(new RegExp(`\\.${sel}:focus-visible\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
      expect(block, sel).not.toContain('outline: none');
      expect(block, sel).toContain('box-shadow: 0 0 0 2px var(--moi-color-white), 0 0 0 4px var(--ring, var(--moi-color-ink))');
      expect(block, sel).not.toMatch(/outline:\s*2px solid var\(--moi-color-ink\)/);
    }
    const exam = readFileSync('src/ui/exam/exam.css', 'utf8');
    const block = exam.match(/\.moi-exam-select:focus-visible\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(block).not.toContain('outline: none');
    expect(block).toContain('box-shadow: 0 0 0 2px var(--moi-color-white), 0 0 0 4px var(--ring, var(--moi-color-ink))');
  });

  it('고대비(forced-colors)에서도 포커스가 보이도록 투명 outline을 둔다', () => {
    for (const path of ['src/ui/shell.css', 'src/ui/exam/exam.css']) {
      const css = readFileSync(path, 'utf8');
      for (const m of css.matchAll(/:focus-visible\s*\{[^}]*\}/gs)) {
        if (!m[0].includes('box-shadow')) continue;
        expect(m[0], path).toContain('outline: 2px solid transparent');
        expect(m[0], path).toContain('outline-offset: 2px');
      }
    }
  });

  it('44px 터치 타깃은 그대로다', () => {
    const shell = readFileSync('src/ui/shell.css', 'utf8');
    expect(shell).toMatch(/\.moi-brand-link[\s\S]*?min-height:\s*44px/);
    expect(shell).toMatch(/\.moi-logout-action[\s\S]*?min-height:\s*var\(--moi-touch-min\)/);
    const exam = readFileSync('src/ui/exam/exam.css', 'utf8');
    expect(exam).toMatch(/\.moi-exam-select[\s\S]*?min-height:\s*var\(--moi-touch-min\)/);
  });
});
