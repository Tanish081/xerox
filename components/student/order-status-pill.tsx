import type { OrderStatus } from '@/types';

const statusStyles: Record<OrderStatus, string> = {
  pending_payment: 'bg-amber-100 text-amber-800',
  pending_approval: 'bg-blue-100 text-blue-800',
  queued: 'bg-indigo-100 text-indigo-800',
  processing: 'bg-fuchsia-100 text-fuchsia-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-rose-100 text-rose-800',
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}>{status.replaceAll('_', ' ')}</span>;
}
