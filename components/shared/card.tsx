import { cn } from '@/lib/utils';
import type { PropsWithChildren } from 'react';

export function Card({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('rounded-xl bg-white p-5 shadow-sm', className)}>{children}</div>;
}
