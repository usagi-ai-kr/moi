import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { copy } from '../../src/ui/copy';
import { ExamScopeProvider } from '../../src/ui/exam/ExamScopeProvider';
import { ExamSelector } from '../../src/ui/exam/ExamSelector';

function renderSelector(initial = '/?exam=saa-c03') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/"
          element={
            <ExamScopeProvider>
              <ExamSelector id="moi-exam-select-test" />
            </ExamScopeProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('#285 시험 select chevron 여백', () => {
  it('select를 wrapper로 감싸고 chevron 아이콘이 1개만 있다', () => {
    const { container } = renderSelector();
    const select = screen.getByRole('combobox', { name: copy.exam.label });
    expect(select.closest('.moi-exam-select-wrap')).not.toBeNull();
    const svgs = container.querySelectorAll('.moi-exam-select-wrap svg');
    expect(svgs).toHaveLength(1);
  });

  it('chevron은 장식(aria-hidden·포커스 제외)이다', () => {
    const { container } = renderSelector();
    const svg = container.querySelector('.moi-exam-select-wrap svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
  });

  it('label htmlFor와 select id가 연결된다', () => {
    renderSelector();
    const select = screen.getByRole('combobox', { name: copy.exam.label });
    expect(select).toHaveAttribute('id', 'moi-exam-select-test');
    expect(document.querySelector('label[for="moi-exam-select-test"]')).not.toBeNull();
  });

  it('값 변경이 동작한다(네이티브 select semantics)', () => {
    renderSelector();
    const select = screen.getByRole('combobox', { name: copy.exam.label }) as unknown as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('saa-c03');
    fireEvent.change(select, { target: { value: 'saa-c03' } });
    expect(select.value).toBe('saa-c03');
  });

  it('UA 화살표 제거·44px 계약이 CSS에 있다', () => {
    const css = readFileSync('src/ui/exam/exam.css', 'utf8');
    expect(css).toMatch(/\.moi-exam-select[\s\S]*appearance:\s*none/);
    expect(css).toMatch(/\.moi-exam-select[\s\S]*padding-inline-end:\s*44px/);
    expect(css).toMatch(/\.moi-exam-select[\s\S]*min-height:\s*var\(--moi-touch-min\)/);
    expect(css).toMatch(/\.moi-exam-select-wrap[\s\S]*position:\s*relative/);
    expect(css).toMatch(/\.moi-exam-select-wrap[\s\S]*display:\s*inline-flex/);
    expect(css).toMatch(/\.moi-exam-select-chevron[\s\S]*inset-inline-end:\s*16px/);
    expect(css).toMatch(/\.moi-exam-select-chevron[\s\S]*pointer-events:\s*none/);
  });
});
