import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { cn } from '@/ui/lib/utils';

interface QuestionCardProps {
  readonly stem: string;
  readonly hint?: string;
  readonly titleAs?: 'h1' | 'h2' | 'h3';
  readonly children: ReactNode;
  readonly className?: string;
  readonly titleClassName?: string;
}

// 복습 카드형 질문을 시각 기준으로 한 공통 질문 카드 (#274).
// 일반 학습·복습이 같은 테두리·padding/gap·줄바꿈·overflow를 공유한다.
// 제목 레벨만 호출자가 정한다(학습=h1, 복습=h3) — semantics는 모드별로 유지.
export function QuestionCard({ stem, hint, titleAs = 'h3', children, className, titleClassName }: QuestionCardProps) {
  const TitleTag = titleAs;
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader>
        <TitleTag
          data-slot="card-title"
          className={cn(
            'min-w-0 text-base font-semibold leading-relaxed break-words [overflow-wrap:anywhere] md:text-lg',
            titleClassName,
          )}
        >
          {stem}
        </TitleTag>
        {hint && <p className="min-w-0 text-sm break-words text-muted-foreground [overflow-wrap:anywhere]">{hint}</p>}
      </CardHeader>
      <CardContent className="min-w-0">
        {children}
      </CardContent>
    </Card>
  );
}
