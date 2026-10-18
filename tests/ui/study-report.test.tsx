import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveSet, StudySubmittedSet } from '../../src/ui/api/client';
import { ReportButton } from '../../src/ui/study/ReportButton';
import { ResultView } from '../../src/ui/study/ResultView';

function httpError(status: number, body: unknown): HTTPError {
  return new HTTPError(
    new Response(JSON.stringify(body), { status }),
    new Request('http://localhost/api/study/reports'),
    {} as never,
  );
}

interface PostOpts {
  fail?: boolean;
  calls?: Array<{ path: string; json: unknown }>;
}

// 신고 전용 최소 fake client — POST /api/study/reports만 동작시킨다 (#53).
function fakeReportClient(o: PostOpts = {}): ApiClient {
  return {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn((path: string, opts?: { json?: unknown }) => ({
      json: async () => {
        o.calls?.push({ path: String(path), json: opts?.json });
        if (o.fail) throw httpError(500, { error: 'internal' });
        return { outcome: 'recorded' };
      },
    })),
  } as unknown as ApiClient;
}

function submittedSet(): StudySubmittedSet {
  const items = [0, 1].map((i) => ({
    questionId: `q-${i}`,
    questionVersionId: `qv-${i}`,
    versionNo: 1,
    optionOrder: [`q-${i}-a`, `q-${i}-b`],
    stem: `문제 ${i} 본문`,
    options: [
      { optionId: `q-${i}-a`, text: '보기 A' },
      { optionId: `q-${i}-b`, text: '보기 B' },
    ],
    response: { kind: 'unanswered' as const },
    explanation: `문제 ${i} 해설`,
    sourceUrls: [],
  }));
  return {
    id: 'set-1',
    userId: 'u-1',
    examId: 'saa-c03',
    mode: 'all',
    status: 'submitted',
    createdAt: 1700000000000,
    submittedAt: 1700000001000,
    items,
    result: {
      answeredCount: 0,
      correctCount: 0,
      accuracyPercent: 0,
      passCount: 0,
      unansweredCount: 2,
      perItem: items.map((it) => ({
        questionId: it.questionId,
        responseKind: 'unanswered',
        selectedOptionIds: [],
        correctOptionIds: [`${it.questionId}-a`],
        correct: false,
      })),
    },
  } as StudySubmittedSet;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('신고 UI (#53)', () => {
  it('사유 선택 후 제출하면 POST body에 questionId·questionVersionId·reason를 보낸다', async () => {
    const calls: Array<{ path: string; json: unknown }> = [];
    render(
      <ReportButton client={fakeReportClient({ calls })} questionId="q-1" questionVersionId="qv-1" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '문제 신고' }));
    expect(screen.getByRole('dialog', { name: '문제 신고' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '오탈자가 있습니다' }));
    fireEvent.click(screen.getByRole('button', { name: '신고하기' }));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].path).toBe('api/study/reports');
    expect(calls[0].json).toEqual({ questionId: 'q-1', questionVersionId: 'qv-1', reason: 'typo' });
  });

  it('성공하면 접수 메시지와 닫기 버튼을 보인다', async () => {
    render(<ReportButton client={fakeReportClient()} questionId="q-1" questionVersionId="qv-1" />);
    fireEvent.click(screen.getByRole('button', { name: '문제 신고' }));
    fireEvent.click(screen.getByRole('button', { name: '신고하기' }));
    expect(await screen.findByText('신고가 접수되었습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('실패하면 신고하지 못했습니다를 보인다', async () => {
    render(<ReportButton client={fakeReportClient({ fail: true })} questionId="q-1" questionVersionId="qv-1" />);
    fireEvent.click(screen.getByRole('button', { name: '문제 신고' }));
    fireEvent.click(screen.getByRole('button', { name: '신고하기' }));
    expect(await screen.findByText('신고하지 못했습니다')).toBeInTheDocument();
  });

  it('결과 화면에서도 문항별 신고 버튼이 보인다', () => {
    render(
      <ResultView
        client={fakeReportClient()}
        set={submittedSet()}
        onRestart={() => {}}
        onHistory={() => {}}
      />,
    );
    expect(screen.getAllByRole('button', { name: '문제 신고' }).length).toBeGreaterThanOrEqual(1);
  });

  it('학습 문제 화면에도 신고 버튼이 보인다', async () => {
    const set: StudyActiveSet = {
      id: 'set-1',
      userId: 'u-1',
      examId: 'saa-c03',
      mode: 'all',
      status: 'active',
      createdAt: 1700000000000,
      items: [
        {
          questionId: 'q-0',
          questionVersionId: 'qv-0',
          versionNo: 1,
          optionOrder: ['q-0-a'],
          stem: '문제 0 본문',
          options: [{ optionId: 'q-0-a', text: '보기 A' }],
          response: { kind: 'unanswered' },
        },
      ],
    };
    const { QuestionView } = await import('../../src/ui/study/QuestionView');
    render(
      <QuestionView
        client={fakeReportClient()}
        items={set.items}
        index={0}
        save="idle"
        submitting={false}
        unansweredCount={1}
        submitError={null}
        onIndex={() => {}}
        onAnswer={() => {}}
        onPass={() => {}}
        onClear={() => {}}
        onRetry={() => {}}
        onSubmitRequest={() => {}}
        onAbandonRequest={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: '문제 신고' })).toBeInTheDocument();
  });
});
