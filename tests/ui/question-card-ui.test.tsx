import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, StudyActiveItem } from '../../src/ui/api/client';
import type { ReviewPendingItem } from '../../src/ui/api/review-client';
import { OptionFieldset } from '../../src/ui/components/option-fieldset';
import { OptionRow } from '../../src/ui/components/option-row';
import { QuestionCard } from '../../src/ui/components/question-card';
import { copy } from '../../src/ui/copy';
import { ReviewQuestion } from '../../src/ui/review/ReviewQuestion';
import { QuestionView } from '../../src/ui/study/QuestionView';

function fakeClient(): ApiClient {
  return {
    get: vi.fn(() => ({ json: async () => ({ examId: 'saa-c03', total: 0, items: [] }) })),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as ApiClient;
}

function withProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function studyItem(): StudyActiveItem {
  return {
    questionId: 'q-1',
    questionVersionId: 'qv-1',
    versionNo: 1,
    optionOrder: ['opt-a', 'opt-b'],
    stem: 'VPC와 서브넷 구성을 설명한 긴 AWS 문장 스템',
    options: [
      { optionId: 'opt-a', text: '보기 A 내용' },
      { optionId: 'opt-b', text: '매우 긴 보기 B 내용 '.repeat(20) },
    ],
    answerCount: 1,
    response: { kind: 'unanswered' },
  };
}

function reviewItem(): ReviewPendingItem {
  return {
    questionId: 'q-w1',
    stem: '복습 스템: VPC 피어링 제약 사항은?',
    options: [
      { optionId: 'opt-a', text: '보기 A 설명' },
      { optionId: 'opt-b', text: '보기 B 설명' },
    ],
    answerCount: 1,
    response: null,
  };
}

describe('공통 질문 카드·선택지 행 (#274)', () => {
  it('제목 레벨만 바꾸고 같은 테두리·padding을 공유한다', () => {
    const { rerender, container } = render(
      <QuestionCard stem="학습 스템" hint="정답 1개를 고르세요" titleAs="h1">
        <p>옵션</p>
      </QuestionCard>,
    );
    expect(screen.getByRole('heading', { level: 1, name: '학습 스템' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).not.toBeNull();
    rerender(
      <QuestionCard stem="복습 스템" hint="정답 1개를 고르세요" titleAs="h3">
        <p>옵션</p>
      </QuestionCard>,
    );
    expect(screen.getByRole('heading', { level: 3, name: '복습 스템' })).toBeInTheDocument();
  });

  it('선택지 행은 44px·라벨 클릭·체크박스 semantics·포커스를 유지한다', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <OptionRow checked={false} onChange={onChange} ariaLabel="보기 1 보기 A" index={0} text="보기 A" />,
    );
    const box = screen.getByLabelText('보기 1 보기 A');
    expect(box).toHaveAttribute('type', 'checkbox');
    expect(box).not.toBeChecked();
    // 미선택은 border-border, 선택은 border-primary + bg-primary/5.
    expect(box.closest('label')?.getAttribute('class')).toContain('border-border');
    expect(box.closest('label')?.getAttribute('class')).toContain('min-h-[44px]');
    fireEvent.click(screen.getByText('1. 보기 A'));
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(
      <OptionRow checked onChange={onChange} ariaLabel="보기 1 보기 A" index={0} text="보기 A" />,
    );
    expect(screen.getByLabelText('보기 1 보기 A')).toBeChecked();
    expect(screen.getByLabelText('보기 1 보기 A').closest('label')?.getAttribute('class')).toContain(
      'border-primary',
    );
  });

  it('긴 보기 텍스트는 줄바꿈·overflow 클래스로 카드 안에 머문다', () => {
    render(
      <QuestionCard stem="스템" titleAs="h3">
        <OptionRow checked={false} onChange={() => {}} ariaLabel="보기 2 긴 보기" index={1} text={'긴 보기 '.repeat(50)} />
      </QuestionCard>,
    );
    const span = screen.getByText(/긴 보기/, { selector: 'span' });
    expect(span.getAttribute('class')).toContain('break-words');
    expect(span.getAttribute('class')).toContain('flex-1');
  });
});

describe('일반 학습 카드 통일 회귀 (#274)', () => {
  it('카드·선택지 행을 쓰면서 제출 시 채점·탐색·저장 로직을 유지한다', () => {
    const onAnswer = vi.fn();
    withProviders(
      <QuestionView
        client={fakeClient()}
        items={[studyItem()]}
        index={0}
        save="idle"
        submitting={false}
        unansweredCount={1}
        submitError={null}
        onIndex={vi.fn()}
        onAnswer={onAnswer}
        onPass={vi.fn()}
        onClear={vi.fn()}
        onRetry={vi.fn()}
        onSubmitRequest={vi.fn()}
        onAbandonRequest={vi.fn()}
      />,
    );
    // 카드 + h1 제목 + 힌트.
    expect(document.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: /VPC와 서브넷/ })).toBeInTheDocument();
    expect(screen.getByText(copy.study.answerCountHint(1))).toBeInTheDocument();
    // 진행 바 형식 유지(1/1 포함) + 복습식 헤더(border-b).
    expect(screen.getByText(/1\/1/)).toBeInTheDocument();
    // 선택지 행은 카드형 + 라벨 클릭.
    const opt = screen.getByLabelText(/보기 1/);
    expect(opt.closest('label')?.getAttribute('class')).toContain('rounded-md');
    fireEvent.click(opt);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    // 모드별 액션 유지: Pass·지우기·이전/다음·제출·포기·문항 액션 그룹.
    expect(screen.getByRole('button', { name: 'Pass' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.study.clear })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: copy.study.itemActions })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /제출하기/ })).toBeInTheDocument();
  });
});

describe('복습 시각 기준 회귀 (#274)', () => {
  it('공통 컴포넌트로 바꿔도 즉시 채점·문구·액션이 그대로다', () => {
    const onToggle = vi.fn();
    const onSubmit = vi.fn();
    withProviders(
      <ReviewQuestion
        client={fakeClient()}
        examId="saa-c03"
        item={reviewItem()}
        cursor={0}
        total={2}
        selectedOptions={[]}
        isSubmitting={false}
        errorMsg={null}
        onToggleOption={onToggle}
        onSubmit={onSubmit}
        onPass={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    expect(document.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(screen.getByText('문제 1 / 2')).toBeInTheDocument();
    expect(screen.getByText(copy.review.answerCountHint(1))).toBeInTheDocument();
    const section = screen.getByLabelText('복습 문항 1/2');
    expect(within(section).getByLabelText(/보기 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/보기 1/));
    expect(onToggle).toHaveBeenCalledWith('opt-a');
    // 미선택 제출 비활성(즉시 채점 모드 유지).
    expect(screen.getByRole('button', { name: copy.review.submit })).toBeDisabled();
  });
});

describe('after 감사 잔여 수정 (#274 fix r2)', () => {
  it('공통 fieldset은 UA 테두리·padding을 초기화한다', () => {
    render(
      <OptionFieldset>
        <OptionRow checked={false} onChange={() => {}} ariaLabel="보기 1 A" index={0} text="A" />
      </OptionFieldset>,
    );
    const fs = document.querySelector('fieldset');
    expect(fs?.getAttribute('class')).toContain('border-0');
    expect(fs?.getAttribute('class')).toContain('p-0');
    expect(fs?.querySelector('legend')?.getAttribute('class')).toContain('sr-only');
  });

  it('학습 문항 액션은 카드 안 보기 위에 있고 stem→그룹→보기 순서다', () => {
    withProviders(
      <QuestionView
        client={fakeClient()}
        items={[studyItem()]}
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
    const stem = screen.getByRole('heading', { level: 1, name: /VPC와 서브넷/ });
    const actions = screen.getByRole('group', { name: copy.study.itemActions });
    const opt = screen.getByLabelText(/보기 1/);
    // 카드 안에 함께 렌더된다.
    expect(actions.closest('[data-slot="card"]')).not.toBeNull();
    const before = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(before(stem, actions)).toBe(true);
    expect(before(actions, opt)).toBe(true);
    expect(before(actions, screen.getByRole('button', { name: '이전' }))).toBe(true);
  });

  it('복습에도 학습과 같은 4px 진행 바가 있다', () => {
    const { container } = withProviders(
      <ReviewQuestion
        client={fakeClient()}
        examId="saa-c03"
        item={reviewItem()}
        cursor={0}
        total={2}
        selectedOptions={[]}
        isSubmitting={false}
        errorMsg={null}
        onToggleOption={vi.fn()}
        onSubmit={vi.fn()}
        onPass={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    const bar = container.querySelector('.moi-study-progressbar');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
    expect(bar?.querySelector('span')?.getAttribute('style')).toContain('50%');
    // 복습 fieldset도 UA 테두리 초기화를 공유한다.
    expect(container.querySelector('fieldset')?.getAttribute('class')).toContain('border-0');
  });

  it('신고 열기 버튼은 shadcn ring-2 포커스를 쓴다', () => {
    withProviders(
      <QuestionView
        client={fakeClient()}
        items={[studyItem()]}
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
    const report = screen.getByRole('button', { name: copy.report.open });
    for (const t of ['focus-visible:ring-2', 'focus-visible:ring-ring', 'focus-visible:outline-none']) {
      expect((report.getAttribute('class') ?? '').split(/\s+/)).toContain(t);
    }
  });
});
