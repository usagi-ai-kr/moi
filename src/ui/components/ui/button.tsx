import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/ui/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'bg-muted text-foreground hover:bg-border',
        destructive: 'bg-destructive text-white hover:opacity-90',
        ghost: 'text-foreground hover:bg-muted',
        outline: 'border border-border bg-background text-foreground hover:bg-muted',
      },
      size: {
        sm: 'h-11 min-h-[44px] rounded-md px-3 text-sm',
        md: 'h-11 min-h-[44px] rounded-md px-4 text-sm',
        lg: 'h-11 min-h-[44px] rounded-lg px-6 text-base',
        icon: 'size-11 min-h-[44px] min-w-[44px] rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  pending?: boolean;
}

function Button({ className, variant, size, asChild, pending, disabled, children, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  const content = (
    <>
      {pending ? <Loader2 data-slot="spinner" aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </>
  );
  if (asChild) {
    return (
      <Slot data-slot="button" className={classes} aria-busy={pending || undefined} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      data-slot="button"
      className={classes}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {content}
    </button>
  );
}

export { Button, buttonVariants };
