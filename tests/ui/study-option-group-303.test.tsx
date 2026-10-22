// #303 — 학습 시작 화면의 범위·문항 수 선택 그룹 마크업·접근성 계약.
//  · 각 그룹의 옵션은 하나의 컨테이너(.moi-study-options)로 묶인다.
//  · 네이티브 radio name·checked 상태(키보드 radio semantics)는 그대로다.
//  · 활성 상태는 색상 외 표시(굵기) + 접근 상태(checked)로 구분된다.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { copy } from '../../src/ui/copy';
import { StartView } from '../../src/ui/study/StartView';

const OPTIONS_CLASS = 'moi-study-options';

function renderStart(props: Partial<React.ComponentProps<typeof StartView>> = {}) {
  const noop = vi.fn();
  return render(
    <StartView
      scope="all"
      domainId="dom-security"
      pending={false}
      conflict={false}
      unauthorized={false}
      startError={null}
      onScope={noop}
      onDomain={noop}
      onSize={noop}
      onStart={noop}
      onResume={noop}
      {...props}
    />,
  );
}

function groupOf(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

describe('#303 범위·문항 수 선택 그룹', () => {
  it('범위 그룹의 3개 옵션이 하나의 컨테이너로 묶인다', () => {
    renderStart();
    const group = groupOf('범위');
    const containers = group.querySelectorAll(`.${OPTIONS_CLASS}`);
    expect(containers).toHaveLength(1);
    const container = containers[0] as HTMLElement;
    // legend 은 fieldset 의 첫 자식 — 접근 이름 유지(#269).
    expect(group.firstElementChild).toHaveClass('moi-study-legend');
    expect(container.parentElement).toBe(group);
    const options = container.querySelectorAll('.moi-study-radio');
    expect(options).toHaveLength(3);
    expect(within(container).getAllByRole('radio')).toHaveLength(3);
    // 그룹 안의 모든 radio 가 컨테이너 안에 있다(옵션이 그룹 밖으로 새지 않는다).
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
  });

  it('문항 수 그룹의 2개 옵션이 하나의 컨테이너로 묶인다', () => {
    renderStart();
    const group = groupOf(copy.study.sizeLegend);
    const containers = group.querySelectorAll(`.${OPTIONS_CLASS}`);
    expect(containers).toHaveLength(1);
    const container = containers[0] as HTMLElement;
    expect(container.parentElement).toBe(group);
    expect(container.querySelectorAll('.moi-study-radio')).toHaveLength(2);
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
  });

  it('네이티브 radio 그룹 이름이 유지된다 — 그룹당 탭 정지 1개·화살표 이동 semantics', () => {
    renderStart();
    const scopeRadios = screen.getAllByRole('radio', { name: /^(전체|영역별|취약 영역)$/ });
    for (const radio of scopeRadios) expect(radio).toHaveAttribute('name', 'study-scope');
    const sizeRadios = screen.getAllByRole('radio', { name: /^\d+문제$/ });
    expect(sizeRadios).toHaveLength(2);
    for (const radio of sizeRadios) expect(radio).toHaveAttribute('name', 'study-size');
  });

  it('활성 상태는 접근 상태(checked)로 노출된다 — 색상만으로 구분하지 않는다', () => {
    renderStart();
    expect(screen.getByRole('radio', { name: copy.study.scopeAll })).toBeChecked();
    expect(screen.getByRole('radio', { name: copy.study.scopeDomain })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: copy.study.scopeWeak })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: copy.study.sizeOption(4) })).toBeChecked();
    expect(screen.getByRole('radio', { name: copy.study.sizeOption(8) })).not.toBeChecked();
    // 그룹마다 선택은 1건 — 접근성 트리에서 'checked' 로 구별된다.
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(2);
  });

  it('선택 항목 텍스트는 라벨 이름으로 노출된다 — 접근 이름이 색상과 무관하게 식별된다', () => {
    renderStart();
    expect(screen.getByRole('radio', { name: copy.study.scopeWeak })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: copy.study.sizeOption(8) })).toBeInTheDocument();
  });
});
