import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/ui/lib/utils';

const alertVariants = cva('flex items-start gap-2 rounded-md border p-3 text-sm', {
  variants: {
    variant: {
      error: 'border-destructive/40 bg-background text-foreground',
      warning: 'border-border bg-muted text-foreground',
      info: 'border-border bg-background text-foreground',
    },
  },
  defaultVariants: { variant: 'info' },
});

const icons = { error: CircleAlert, warning: TriangleAlert, info: Info } as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
}

function Alert({ className, variant, title, children, ...props }: AlertProps) {
  const Icon = icons[variant ?? 'info'];
  return (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title ? <p data-slot="alert-title" className="font-semibold">{title}</p> : null}
        <div data-slot="alert-description">{children}</div>
      </div>
    </div>
  );
}

export { Alert, alertVariants };
