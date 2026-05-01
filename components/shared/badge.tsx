import { cn } from '@/lib/utils';
import type { PropsWithChildren } from 'react';

export function Badge({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <span className={cn('inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700', className)}>{children}</span>;
}
