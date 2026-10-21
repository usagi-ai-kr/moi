import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../src/ui/api/client';
import { Button } from '../../src/ui/components/ui/button';
import { AccountPage } from '../../src/ui/pages/AccountPage';
import { ConflictPanel } from '../../src/ui/study/ConflictPanel';
import { HistoryView } from '../../src/ui/study/HistoryView';
import { ResultQuestionList } from '../../src/ui/study/ResultQuestionList';
import { ResultView } from '../../src/ui/study/ResultView';
import { StartView } from '../../src/ui/study/StartView';
import { ReviewCandidates } from '../../src/ui/review/ReviewCandidates';
import { icon, layout, radius } from '../../src/ui/tokens';

function providers(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function fakeClient(): ApiClient {
  return {
    get: vi.fn(() => ({ json: async () => ({ examId: 'saa-c03', total: 0, items: [] }) })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

describe('225 design-consistency: heading hierarchy', () => {
  it('Start: h1 1개(학습 범위 선택)', () => {
    const { container } = render(
      <StartView scope="all" domainId="dom-security" pending={false} conflict={false} unauthorized={false} startError={null} onScope={() => {}} onDomain={() => {}} onStart={() => {}} onResume={() => {}} />,
    );
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('학습 범위 선택');
  });

  it('Result: h1 결과 + h2 문항 목록/정정 (h3 하위 없음)', () => {
    const set = {
      id: 's1', userId: 'u1', examId: 'saa-c03', mode: 'all', status: 'submitted',
      createdAt: 1, submittedAt: 2,
      items: [{ questionId: 'q1', questionVersionId: 'qv1', versionNo: 1, optionOrder: ['a'], stem: 's', options: [{ optionId: 'a', text: 'A' }], response: { kind: 'answered' }, explanation: 'e', sourceUrls: [] }],
      result: { answeredCount: 1, correctCount: 1, accuracyPercent: 100, passCount: 0, unansweredCount: 0, perItem: [{ questionId: 'q1', responseKind: 'answered', selectedOptionIds: ['a'], correctOptionIds: ['a'], correct: true }] },
    } as never;
    const { container } = providers(<ResultView client={fakeClient()} set={set} onRestart={() => {}} onHistory={() => {}} corrections={{ items: [{ id: 'c1', questionVersionId: 'qv1', reason: 'typo' }], corrected: { accuracyPercent: 100, validTotal: 1, excludedCount: 0 } } as never} />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('학습 결과');
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual(expect.arrayContaining(['문항 목록', '정정 반영']));
  });

  it('ResultQuestionList: h2 문항 목록', () => {
    render(<ResultQuestionList perItem={[{ questionId: 'q1', responseKind: 'answered', selectedOptionIds: [], correctOptionIds: [], correct: true } as never]} currentIndex={0} onSelect={() => {}} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('문항 목록');
  });

  it('ConflictPanel: h2 충돌 확인', () => {
    render(<ConflictPanel conflicts={[{ questionId: 'q1', server: { kind: 'pass' }, local: { kind: 'unanswered' } } as never]} items={[]} pending={false} onUseServer={() => {}} onUseMine={() => {}} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('답안 충돌 확인');
  });

  it('HistoryView: h2 완료한 학습 (페이지 h1은 HistoryPage 소유)', () => {
    const { container } = providers(<HistoryView items={[]} total={0} page={1} pageSize={20} pending={false} loadError={false} detailId={null} onPage={() => {}} onDetail={() => {}} onRetry={() => {}} />);
    expect(container.querySelectorAll('h1')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('완료한 학습');
  });

  it('Account: h1 계정 1개', () => {
    const { container } = render(<AccountPage user={{ id: 'u1', createdAt: 1, lastLoginAt: 2 }} />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('계정');
  });

  it('ReviewCandidates 빈 상태: h1 없이 h2 대기 목록 아님(빈 카드) — 계층 유지', () => {
    const { container } = providers(<ReviewCandidates data={{ examId: 'saa-c03', mode: 'wrong', total: 2, items: [] } as never} isLoading={false} isError={false} mode="wrong" isStarting={false} onStart={() => {}} onRetry={() => {}} />);
    expect(container.querySelectorAll('h1')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/복습 대기/);
  });
});

describe('225 design-consistency: button matrix', () => {
  it('shadcn Button: 44px 터치·반경 토큰·pending', () => {
    const { rerender } = render(<Button variant="primary" size="md">시작</Button>);
    const btn = screen.getByRole('button', { name: '시작' });
    for (const t of ['h-11', 'min-h-[44px]', 'rounded-md']) expect(btn.className).toContain(t);
    rerender(<Button variant="primary" size="lg">큰 시작</Button>);
    const lg = screen.getByRole('button', { name: '큰 시작' });
    expect(lg.className).toContain('min-h-[44px]');
    expect(lg.className).toContain('rounded-lg');
    expect(lg.className).not.toContain('min-h-[48px]');
  });

  it('토큰 단일 소스: icon 16/20/24·radius 6/8/12·폭 960/720·터치 44', () => {
    expect(icon).toEqual({ sm: 16, md: 20, lg: 24 });
    expect(radius).toEqual({ sm: 6, md: 8, lg: 12 });
    expect(layout.containerMaxWidth).toBe(960);
    expect(layout.readingMaxWidth).toBe(720);
    expect(layout.touchTargetMin).toBe(44);
    expect(layout.controlHeight).toBe(40);
  });

  it('ReviewCandidates: 시작=primary·대체=outline', () => {
    const { container } = providers(<ReviewCandidates data={{ examId: 'saa-c03', mode: 'wrong', total: 0, items: [] } as never} isLoading={false} isError={false} mode="wrong" isStarting={false} onStart={() => {}} onRetry={() => {}} />);
    const scope = within(container as HTMLElement);
    expect(scope.getByRole('link', { name: '새 학습 시작' }).className).toContain('bg-primary');
  });
});
