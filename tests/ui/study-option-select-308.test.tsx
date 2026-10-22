// #308 — 단일 선택 '1개를 고르시오' 문항에서 복수 선택 방지 (BDD AC).
// Given 단일 선택 문항 When 보기 A 선택 후 B 선택 Then B만 선택됨·제출 payload는 정확히 1개.
// 정답 개수 메타데이터(answerCount)가 진실 원천이다 — 지시문 문자열 파싱 금지.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, ItemResponse, StudyActiveItem } from '../../src/ui/api/client';
import { QuestionView } from '../../src/ui/study/QuestionView';

function fakeClient(): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function withQuery(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function item(overrides?: Partial<StudyActiveItem>): StudyActiveItem {
  return {
    questionId: 'q-1',
    questionVersionId: 'qv-1',
    versionNo: 1,
    optionOrder: ['opt-a', 'opt-b'],
    stem: '단일 선택 문항 본문',
    options: [
      { optionId: 'opt-a', text: '보기 A' },
      { optionId: 'opt-b', text: '보기 B' },
    ],
    answerCount: 1,
    response: { kind: 'unanswered' },
    ...overrides,
  };
}

interface HarnessProps {
  readonly item: StudyActiveItem;
  readonly answers: ItemResponse[];
  readonly onAnswered: () => void;
}

// 부모 상태(저장된 실제 응답)를 반영하는 하네스 — 선택 semantics 선택이 렌더에 반영된다.
function QuestionHarness({ item: initial, answers, onAnswered }: HarnessProps) {
  const [response, setResponse] = useState(initial.response);
  const item = useMemo(() => ({ ...initial, response }), [initial, response]);
  return (
    <QuestionView
      client={fakeClient()}
      items={[item]}
      index={0}
      save="idle"
      submitting={false}
      unansweredCount={1}
      submitError={null}
      onIndex={vi.fn()}
      onAnswer={(_questionId: string, next: ItemResponse) => {
        answers.push(next);
        setResponse(next);
        onAnswered();
      }}
      onPass={vi.fn()}
      onClear={vi.fn()}
      onRetry={vi.fn()}
      onSubmitRequest={vi.fn()}
      onAbandonRequest={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('#308 단일 선택 문항 렌더', () => {
  it('정답 1개 문항은 보기를 radio로 렌더하고 한 그룹 이름을 공유한다', () => {
    withQuery(
      <QuestionHarness item={item()} answers={[]} onAnswered={vi.fn()} />,
    );
    const first = screen.getByLabelText('보기 1 보기 A') as HTMLInputElement;
    const second = screen.getByLabelText('보기 2 보기 B') as HTMLInputElement;
    expect(first).toHaveAttribute('type', 'radio');
    expect(second).toHaveAttribute('type', 'radio');
    expect(second.getAttribute('name')).toBe(first.getAttribute('name'));
    expect(first.getAttribute('name')).toContain('qv-1');
  });

  it('정답 2개 문항은 기존 checkbox semantics를 유지한다', () => {
    withQuery(
      <QuestionHarness item={item({ answerCount: 2 })} answers={[]} onAnswered={vi.fn()} />,
    );
    expect(screen.getByLabelText('보기 1 보기 A')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('보기 2 보기 B')).toHaveAttribute('type', 'checkbox');
  });

  it('보기 그룹은 선택 개수 안내(힌트)를 aria-describedby 로 참조한다(스크린리더 안내)', () => {
    withQuery(
      <QuestionHarness item={item()} answers={[]} onAnswered={vi.fn()} />,
    );
    const group = screen.getByRole('group', { name: '보기 선택' });
    const describedBy = group.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const hint = document.getElementById(describedBy as string);
    expect(hint?.textContent).toContain('정답 1개');
  });
});

describe('#308 단일 선택: 복수 선택 방지 (BDD AC)', () => {
  it('Given 보기 A 선택 When 보기 B 선택 Then B만 선택되고 payload는 정확히 1개다', () => {
    const answers: ItemResponse[] = [];
    withQuery(
      <QuestionHarness item={item()} answers={answers} onAnswered={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('1. 보기 A'));
    fireEvent.click(screen.getByText('2. 보기 B'));

    expect(answers).toHaveLength(2);
    expect(answers[0]).toEqual({ kind: 'answered', optionIds: ['opt-a'] });
    expect(answers[1]).toEqual({ kind: 'answered', optionIds: ['opt-b'] });
    expect((answers[1] as { optionIds: string[] }).optionIds).toHaveLength(1);
    expect(screen.getByLabelText('보기 2 보기 B')).toBeChecked();
    expect(screen.getByLabelText('보기 1 보기 A')).not.toBeChecked();
  });

  it('두 번째 선택으로 교체한 뒤에도 진행 표시는 선택 1이다', () => {
    withQuery(
      <QuestionHarness item={item()} answers={[]} onAnswered={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('1. 보기 A'));
    fireEvent.click(screen.getByText('2. 보기 B'));
    expect(screen.getByText(/문제 1\/1 · 선택 1$/)).toBeInTheDocument();
  });
});

describe('#308 복수 선택 문항 계약 유지', () => {
  it('정답 2개 문항은 여러 보기를 누적 선택할 수 있다(기존 기능 유지)', () => {
    const answers: ItemResponse[] = [];
    withQuery(
      <QuestionHarness item={item({ answerCount: 2 })} answers={answers} onAnswered={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('1. 보기 A'));
    fireEvent.click(screen.getByText('2. 보기 B'));

    expect(answers[0]).toEqual({ kind: 'answered', optionIds: ['opt-a'] });
    expect(answers[1]).toEqual({ kind: 'answered', optionIds: ['opt-a', 'opt-b'] });
  });

  it('저장된 과거 단일 문항 복수 답안은 무단 정정하지 않고 checkbox 호환 렌더 후 다음 선택에서 정정한다', () => {
    // 이전 UI가 저장한 단일 선택 문항의 2개 답안(호출 대상 아님 — 호환 요구).
    const answers: ItemResponse[] = [];
    withQuery(
      <QuestionHarness
        item={item({ response: { kind: 'answered', optionIds: ['opt-a', 'opt-b'] } })}
        answers={answers}
        onAnswered={vi.fn()}
      />,
    );
    // 무단 정정 금지: 그대로 두 보기가 체크 상태로 보인다(호출은 없어야 함).
    expect(answers).toHaveLength(0);
    expect(screen.getByLabelText('보기 1 보기 A')).toBeChecked();
    expect(screen.getByLabelText('보기 2 보기 B')).toBeChecked();
    // 첫 선택(교체 semantics)에서 1개로 정정된다.
    fireEvent.click(screen.getByText('2. 보기 B'));
    expect(answers).toEqual([{ kind: 'answered', optionIds: ['opt-b'] }]);
  });
});
