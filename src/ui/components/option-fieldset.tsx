import type { ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

interface OptionFieldsetProps {
  readonly children: ReactNode;
  readonly className?: string;
}

// 카드 안 보기 그룹 — 일반 학습·복습 공통 fieldset 초기화 (#274 fix r2).
// UA 기본(2px groove 테두리·padding)을 지워 카드 안 이중 테두리를 없앤다.
// legend는 두 모드 동일(sr-only "보기 선택") — copy 변경 없음.
export function OptionFieldset({ children, className }: OptionFieldsetProps) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-2 border-0 p-0', className)}>
      <legend className="sr-only">보기 선택</legend>
      {children}
    </fieldset>
  );
}
