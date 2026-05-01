import { Card } from '@/components/shared/card';
import { StatusBadge } from '@/components/shared/status-badge';
import type { Order } from '@/types';

export function StudentOrderCard({ order }: { order: Order }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Token</div>
          <div className="font-[var(--font-space-grotesk)] text-4xl font-bold tracking-tight text-slate-950">{order.token ?? 'Pending'}</div>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-sm text-slate-600">{order.file_name ?? 'Document upload in progress'}</p>
      <p className="text-sm text-slate-500">ETA: {order.estimated_ready_time ? new Date(order.estimated_ready_time).toLocaleString('en-IN') : 'Calculating'}</p>
    </Card>
  );
}
