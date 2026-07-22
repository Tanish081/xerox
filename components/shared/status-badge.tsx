import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types';

const statusMap: Record<OrderStatus, { label: string; className: string; dotClassName: string }> = {
  pending_payment: {
    label: 'Awaiting Payment',
    className: 'bg-amber-50 text-amber-700 ring-amber-100',
    dotClassName: 'bg-amber-500',
  },
  pending_hod_approval: {
    label: 'Awaiting HOD Approval',
    className: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    dotClassName: 'bg-indigo-500 animate-pulse',
  },
  pending_approval: {
    label: 'Awaiting Approval',
    className: 'bg-amber-50 text-amber-700 ring-amber-100',
    dotClassName: 'bg-amber-500 animate-pulse',
  },
  queued: {
    label: 'In Queue',
    className: 'bg-brand-50 text-brand-700 ring-brand-100',
    dotClassName: 'bg-brand-500',
  },
  processing: {
    label: 'Printing...',
    className: 'bg-brand-50 text-brand-700 ring-brand-100',
    dotClassName: 'bg-brand-500 animate-pulse',
  },
  completed: {
    label: 'Ready for Pickup',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    dotClassName: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Rejected',
    className: 'bg-rose-50 text-rose-700 ring-rose-100',
    dotClassName: 'bg-rose-500',
  },
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const config = statusMap[status];

  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1', config.className, className)}>
      <span className={cn('h-2 w-2 rounded-full', config.dotClassName)} />
      {config.label}
    </span>
  );
}