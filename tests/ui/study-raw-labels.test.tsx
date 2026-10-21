import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type {
  ApiClient,
  StudyActiveItem,
  StudySubmittedItem,
  StudySubmittedSet,
  StudySummary,
} from '../../src/ui/api/client';
import { copy } from '../../src/ui/copy';
import { HistoryView } from '../../src/ui/study/HistoryView';
import { QuestionView } from '../../src/ui/study/QuestionView';
import { ResultView } from '../../src/ui/study/ResultView';
import { StartView } from '../../src/ui/study/StartView';
import { STUDY_DOMAINS } from '../../src/ui/study/types';
import { StatsDomainsPanel } from '../../src/ui/stats/StatsDomainsPanel';
import { domainLabel } from '../../src/ui/stats/labels';

function fakeClient(): ApiClient {
  return {
    get: vi.fn(() => ({
      json: async () => ({ examId: 'saa-c03', total: 0, items: [] }),
    })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function withQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const activeItem: StudyActiveItem = {
  questionId: 'q-1',
  questionVersionId: 'qv-1',
  versionNo: 3,
  optionOrder: ['opt-a', 'opt-b'],
  stem: '문제 1 본문',
  options: [
    { optionId: 'opt-a', text: '보기 A' },
    { optionId: 'opt-b', text: '보기 B' },
  ],
  answerCount: 1,
  response: { kind: 'unanswered' },
};

function submittedItem(questionId: string): StudySubmittedItem {
  return {
    questionId,
    questionVersionId: `qv-${questionId}`,
    versionNo: activeItem.versionNo,
    optionOrder: ['opt-a', 'opt-b', 'opt-c', 'opt-d'],
    stem: activeItem.stem,
    options: activeItem.options,
    answerOptionIds: ['opt-a'],
    response: activeItem.response,
    explanation: '',
    sourceUrls: [],
  };
}

const submittedSet: StudySubmittedSet = {
  id: 'set-1',
  userId: 'u-1',
  examId: 'saa-c03',
  mode: 'all',
  status: 'submitted',
  createdAt: 1700000000000,
  submittedAt: 1700000001000,
  items: [submittedItem('q-1'), submittedItem('q-2'), submittedItem('q-3')],
  result: {
    answeredCount: 2,
    correctCount: 0,
    accuracyPercent: 0,
    passCount: 1,
    unansweredCount: 1,
    perItem: [
      {
        questionId: 'q-1',
        responseKind: 'answered',
        selectedOptionIds: ['opt-b', 'opt-c'],
        correctOptionIds: null,
        correct: false,
      },
      {
        questionId: 'q-2',
        responseKind: 'pass',
        selectedOptionIds: [],
        correctOptionIds: ['opt-a'],
        correct: false,
      },
      {
        questionId: 'q-3',
        responseKind: 'unanswered',
        selectedOptionIds: [],
        correctOptionIds: null,
        correct: false,
      },
      {
        questionId: 'q-4',
        responseKind: 'answered',
        selectedOptionIds: ['unknown'],
        correctOptionIds: null,
        correct: false,
      },
    ],
  },
};

const summary: StudySummary = {
  id: 's-1',
  examId: 'saa-c03',
  mode: 'domain',
  domainId: 'dom-security',
  submittedAt: 1700000000000,
  correctCount: 12,
  accuracyPercent: 60,
};

describe('#148 원시 값 제거', () => {
  it('풀이 화면 메타 줄에 questionId·버전 원시 값을 노출하지 않는다', () => {
    withQueryClient(
      <QuestionView
        client={fakeClient()}
        items={[activeItem]}
        index={0}
        save="idle"
        submitting={false}
        unansweredCount={1}
        submitError={null}
        onIndex={vi.fn()}
        onAnswer={vi.fn()}
        onPass={vi.fn()}
        onClear={vi.fn()}
        onRetry={vi.fn()}
        onSubmitRequest={vi.fn()}
        onAbandonRequest={vi.fn()}
      />,
    );
    expect(screen.getByText('문제 1 본문')).toBeInTheDocument();
    expect(screen.queryByText(/q-1 · v3/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '문제 신고' })).toBeInTheDocument();
  });

  it('결과는 응답 원시값 대신 라벨, 선택/정답은 보기 번호로 보인다', () => {
    withQueryClient(
      <ResultView client={fakeClient()} set={submittedSet} onRestart={vi.fn()} onHistory={vi.fn()} />,
    );
    const first = screen.getByTestId('peritem-q-1');
    // 정보 그룹 dl — 라벨(dt)과 값(dd)이 분리된다(#232).
    expect(within(first).getByText('응답', { selector: 'dd' })).toBeInTheDocument();
    expect(within(first).getByText('선택', { selector: 'dt' })).toBeInTheDocument();
    expect(within(first).getByText('2, 3')).toBeInTheDocument();
    expect(within(first).getByText('정답', { selector: 'dt' })).toBeInTheDocument();
    expect(within(first).getByText('비공개')).toBeInTheDocument();
    expect(screen.queryByText(/answered|unanswered/)).not.toBeInTheDocument();
    // 해설은 한 문항씩만 보여준다(#189) — 다음 문항으로 넘겨 상태 라벨을 확인한다.
    const next = screen.getByRole('button', { name: copy.study.nextItem });
    fireEvent.click(next);
    expect(within(screen.getByTestId('peritem-q-2')).getByText('Pass', { selector: 'dd' })).toBeInTheDocument();
    fireEvent.click(next);
    expect(within(screen.getByTestId('peritem-q-3')).getByText('미응답', { selector: 'dd' })).toBeInTheDocument();
    fireEvent.click(next);
    expect(within(screen.getByTestId('peritem-q-4')).getByText('선택', { selector: 'dt' })).toBeInTheDocument();
    expect(within(screen.getByTestId('peritem-q-4')).getByText('?')).toBeInTheDocument();
  });

  it('결과 상단은 examId 대신 시험 표시명을 보인다', () => {
    withQueryClient(
      <ResultView client={fakeClient()} set={submittedSet} onRestart={vi.fn()} onHistory={vi.fn()} />,
    );
    expect(screen.getByText(/AWS SAA-C03/)).toBeInTheDocument();
    expect(screen.queryByText(/saa-c03/)).not.toBeInTheDocument();
  });

  it('이력 상세는 examId·domainId 대신 시험·영역 라벨을 보인다', () => {
    render(
      <HistoryView
        items={[summary]}
        total={1}
        page={1}
        pageSize={20}
        pending={false}
        loadError={false}
        detailId="s-1"
        onPage={vi.fn()}
        onDetail={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/AWS SAA-C03/)).toBeInTheDocument();
    expect(within(dialog).getByText(/보안/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/saa-c03|dom-security/)).not.toBeInTheDocument();
  });

  it('학습 시작 화면은 내부 시험 ID 대신 표시명을 보인다', () => {
    const noop = vi.fn();
    const { container } = render(
      <StartView
        scope="all"
        domainId=""
        pending={false}
        conflict={false}
        unauthorized={false}
        startError={null}
        onScope={noop}
        onDomain={noop}
        onStart={noop}
        onResume={noop}
      />,
    );
    expect(screen.queryByText(/saa-c03/)).not.toBeInTheDocument();
    // 시험 기준 배지로 표시명을 보여준다(#239) — 시험 선택은 셸 1곳에만 있다.
    expect(container.querySelector('.moi-exam-scope-name')?.textContent).toBe('AWS SAA-C03');
    expect(screen.queryByRole('combobox', { name: '시험' })).not.toBeInTheDocument();
  });
});

describe('#148 domain-label canonical 정합', () => {
  it('STUDY_DOMAINS 비용 최적화 id는 canonical dom-cost-optimization이다', () => {
    const cost = STUDY_DOMAINS.find((d) => d.label === '비용 최적화');
    expect(cost?.id).toBe('dom-cost-optimization');
  });

  it('domainLabel은 canonical·legacy를 비용 최적화로, 미지는 기타 영역으로 매핑한다', () => {
    expect(domainLabel('dom-cost-optimization')).toBe('비용 최적화');
    // legacy alias 1건만 명시적 유지
    expect(domainLabel('dom-cost')).toBe('비용 최적화');
    expect(domainLabel('dom-xyz')).toBe(copy.stats.unknownDomain);
    expect(domainLabel('dom-xyz')).not.toMatch(/dom-/);
    expect(copy.stats.unknownDomain).not.toMatch(/dom-/);
  });

  it('StartView 영역 select는 canonical value·한글 라벨을 쓰고 변경 시 canonical을 전달한다', () => {
    const onDomain = vi.fn();
    const noop = vi.fn();
    render(
      <StartView
        scope="domain"
        domainId="dom-cost-optimization"
        pending={false}
        conflict={false}
        unauthorized={false}
        startError={null}
        onScope={noop}
        onDomain={onDomain}
        onStart={noop}
        onResume={noop}
      />,
    );
    const select = screen.getByLabelText('영역') as unknown as HTMLSelectElement;
    expect(select.value).toBe('dom-cost-optimization');
    const costOption = within(select as unknown as HTMLElement).getByRole('option', { name: '비용 최적화' }) as unknown as HTMLOptionElement;
    expect(costOption.value).toBe('dom-cost-optimization');
    fireEvent.change(select, { target: { value: 'dom-cost-optimization' } });
    expect(onDomain).toHaveBeenCalledWith('dom-cost-optimization');
    expect(screen.queryByText(/dom-cost/)).not.toBeInTheDocument();
  });

  it('HistoryView 상세는 canonical domainId를 비용 최적화로 보이고 raw를 숨긴다', () => {
    const canonical: StudySummary = {
      ...summary,
      id: 's-cost',
      domainId: 'dom-cost-optimization',
    };
    render(
      <HistoryView
        items={[canonical]}
        total={1}
        page={1}
        pageSize={20}
        pending={false}
        loadError={false}
        detailId="s-cost"
        onPage={vi.fn()}
        onDetail={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/비용 최적화/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/dom-cost/)).not.toBeInTheDocument();
  });

  it('분석 패널은 legacy dom-cost 를 canonical 비용 최적화로 보이고 raw 를 숨긴다', async () => {
    const stats = {
      examId: 'saa-c03',
      totalQuestions: 500,
      uniqueFirstSolved: 20,
      coverage: 0.04,
      overallAccuracy: 0.7,
      domains: [
        {
          domainId: 'dom-cost',
          uniqueFirstSolved: 8,
          gradedAttempts: 15,
          cumulativeAccuracy: 0.5,
          recentAccuracy: 0.4,
          status: 'insufficient-data' as const,
        },
      ],
      weakDomains: [],
    };
    const client = {
      get: vi.fn(() => ({ json: async () => stats })),
    } as unknown as ApiClient;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <StatsDomainsPanel client={client} examId="saa-c03" />
      </QueryClientProvider>,
    );
    expect((await screen.findAllByText('비용 최적화')).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/dom-cost/)).not.toBeInTheDocument();
  });

  it('분석 패널은 canonical 영역·취약을 비용 최적화로 보이고 raw를 숨긴다 (#224 AC 1 — StatsPanel 분해)', async () => {
    const stats = {
      examId: 'saa-c03',
      totalQuestions: 500,
      uniqueFirstSolved: 20,
      coverage: 0.04,
      overallAccuracy: 0.7,
      domains: [
        {
          domainId: 'dom-cost-optimization',
          uniqueFirstSolved: 8,
          gradedAttempts: 15,
          cumulativeAccuracy: 0.5,
          recentAccuracy: 0.4,
          status: 'insufficient-data' as const,
        },
      ],
      weakDomains: [
        {
          domainId: 'dom-cost-optimization',
          score: 0.45,
          cumulativeAccuracy: 0.5,
          effectiveRecentAccuracy: 0.4,
          uniqueFirstSolved: 8,
        },
      ],
    };
    const client = {
      get: vi.fn(() => ({ json: async () => stats })),
    } as unknown as ApiClient;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <StatsDomainsPanel client={client} examId="saa-c03" />
      </QueryClientProvider>,
    );
    expect((await screen.findAllByText('비용 최적화')).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/dom-cost-optimization/)).not.toBeInTheDocument();
  });
});
