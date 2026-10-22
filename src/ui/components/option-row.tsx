import { cn } from '@/ui/lib/utils';

interface OptionRowProps {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: () => void;
  readonly ariaLabel: string;
  readonly index: number;
  readonly text: string;
  /** 보기 input 유형 — 단일 선택(radio)·복수 선택(checkbox) 계약에 따른다(#308). 기본값은 checkbox다. */
  readonly type?: 'checkbox' | 'radio';
  /** radio 그룹 이름 — type이 'radio'일 때 같은 문항의 보기가 하나의 네이티브 radio 그룹이 된다. */
  readonly name?: string;
}

// 카드형 선택지 행 — 복습 기준 스타일을 일반 학습·복습이 공유한다 (#274).
// label 클릭·키보드 포커스·44px 터치·checkbox/radio semantics를 유지한다(#308).
// 포커스 ring은 input에만 둔다(#268) — label 의 has-[input:focus-visible]:ring 과 겹치면
// 선택지 행과 체크박스에 ring 이 두 겹으로 보인다.
export function OptionRow({ checked, disabled, onChange, ariaLabel, index, text, type = 'checkbox', name }: OptionRowProps) {
  return (
    <label
      className={cn(
        'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border p-3 text-base transition-colors',
        checked
          ? 'border-primary bg-primary/5 font-medium text-foreground'
          : 'border-border bg-background text-foreground hover:bg-muted/50',
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-5 w-5 shrink-0 rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={ariaLabel}
      />
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
        {index + 1}. {text}
      </span>
    </label>
  );
}
