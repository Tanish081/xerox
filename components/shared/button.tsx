import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger';
  }
>;

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-md',
  secondary: 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-brand-50/60 hover:ring-brand-200',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 hover:shadow-md',
};

export function Button({ className, variant = 'primary', children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
