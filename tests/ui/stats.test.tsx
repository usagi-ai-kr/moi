import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { useUiStore, type ApiClient } from '../../src/ui/session';
import { StatsSummaryPanel } from '../../src/ui/stats/StatsSummaryPanel';
import { StatsDomainsPanel } from '../../src/ui/stats/StatsDomainsPanel';
import { useStudyUiStore } from '../../src/ui/study/store';
import type { StudyStats } from '../../src/ui/api/client';

const STATS: StudyStats = {
  examId: 'saa-c03',
  totalQuestions: 500,
  uniqueFirstSolved: 20,
  coverage: 0.04,
  overallAccuracy: 0.7,
  domains: [
    {
      domainId: 'dom-security',
      uniqueFirstSolved: 8,
      gradedAttempts: 10,
      cumulativeAccuracy: 0.8,
      recentAccuracy: 0.9,
      status: 'ok',
    },
    {
      domainId: 'dom-resilience',
      uniqueFirstSolved: 0,
      gradedAttempts: 0,
      cumulativeAccuracy: null,
      recentAccuracy: null,
      status: 'insufficient-data',
    },
  ],
  weakDomains: [
    {
      domainId: 'dom-resilience',
      score: 0.2,
      cumulativeAccuracy: 0.3,
      effectiveRecentAccuracy: 0.3,
      uniqueFirstSolved: 0,
    },
  ],
};

function clientWith(stats: unknown): ApiClient {
  return {
    get: vi.fn((path: string) => ({
      json: async () => {
        if (String(path).startsWith('api/study/stats')) {
          if (stats instanceof Error) throw stats;
          return stats;
        }
        return { user: { id: '123e4567-e89b-12d3-a456-426614174000' } };
      },
    })),
    post: vi.fn(async () => new Response(null, { status: 204 })),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function renderPanel(client: ApiClient) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StatsSummaryPanel client={client} examId="saa-c03" />
    </QueryClientProvider>,
  );
}

function renderDomainsPanel(client: ApiClient) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StatsDomainsPanel client={client} examId="saa-c03" />
    </QueryClientProvider>,
  );
}

function renderApp(client: ApiClient) {
  window.history.replaceState(null, '', '/');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App client={client} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useUiStore.setState({ authBannerDismissed: false, logoutPending: false });
  useStudyUiStore.setState({
    view: 'start',
    scope: 'all',
    domainId: 'dom-security',
    index: 0,
    save: 'idle',
    confirmSubmit: false,
    confirmAbandon: false,
    historyPage: 1,
    detailId: null,
  });
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('학습 현황 패널', () => {
  it('초기 로딩 중에는 스켈레톤을 표시하고 시각 로딩 텍스트를 남기지 않는다', async () => {
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const client = {
      get: vi.fn(() => ({ json: () => pending })),
    } as unknown as ApiClient;
    renderPanel(client);

    const section = screen.getByRole('region', { name: '학습 현황' });
    expect(section).toHaveAttribute('aria-busy', 'true');
    expect(section.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(screen.getByText('학습 현황을 불러오고 있습니다')).toHaveClass('moi-sr-only');

    await act(async () => {
      release(STATS);
    });

    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    expect(section.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it('성공: 진도/정답률을 표시한다 (AC 1 — 영역·취약은 분석 탭으로 분리)', async () => {
    renderPanel(clientWith(STATS));
    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    expect(screen.getByText(/70%/)).toBeInTheDocument();
  });

  it('분석 패널: 영역 카드·취약 추천을 표시한다 (AC 1·AC 3)', async () => {
    renderDomainsPanel(clientWith(STATS));
    expect(await screen.findByText('영역별 현황')).toBeInTheDocument();
    expect(screen.getByText(/보안/)).toBeInTheDocument();
    expect(screen.getByText(/표본 충분/)).toBeInTheDocument();
    expect(screen.getByText('취약 추천')).toBeInTheDocument();
    expect(screen.getAllByText(/복원력/).length).toBeGreaterThanOrEqual(1);
  });

  it('null 정답률은 데이터 부족 안내를 표시한다', async () => {
    renderPanel(clientWith({ ...STATS, overallAccuracy: null }));
    expect((await screen.findAllByText(/데이터 부족/)).length).toBeGreaterThanOrEqual(1);
  });

  it('오류 시 안내+다시 시도로 복구한다', async () => {
    let calls = 0;
    const client = {
      get: vi.fn(() => ({
        json: async () => {
          calls += 1;
          if (calls === 1) throw new TypeError('fetch failed');
          return STATS;
        },
      })),
      post: vi.fn(),
      patch: vi.fn(),
    } as unknown as ApiClient;
    renderPanel(client);
    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByText(/20\/500/)).toBeInTheDocument());
    expect(calls).toBe(2);
  });

  it('빈 기록 안내를 표시한다', async () => {
    renderPanel(clientWith({ ...STATS, uniqueFirstSolved: 0, coverage: 0, overallAccuracy: null }));
    expect(await screen.findByText(/아직 풀이 기록이 없습니다/)).toBeInTheDocument();
  });

  it('App 학습 현황/이력 메뉴로 요약 탭이 열린다 (AC 1 — 완료 탭은 하위 탭 라벨로 존재)', async () => {
    renderApp(clientWith(STATS));
    await screen.findByRole('link', { name: '학습 현황/이력' });
    fireEvent.click(screen.getByRole('link', { name: '학습 현황/이력' }));
    expect(await screen.findByText(/20\/500/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '완료한 학습' })).toBeInTheDocument();
  });
});
