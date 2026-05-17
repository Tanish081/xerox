import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { StatusBadge } from '@/components/shared/status-badge';
import type { Order } from '@/types';

export function StudentOrderCard({ order, onContinuePayment }: { order: Order; onContinuePayment?: (order: Order) => void }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Token</div>
          <div className="font-[var(--font-space-grotesk)] text-4xl font-bold tracking-tight text-slate-950">{order.token ?? 'Pending'}</div>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-900">{order.file_name ?? 'Document upload in progress'}</p>
        <p className="text-sm text-slate-600">Amount: ₹{Number(order.estimated_amount).toFixed(2)}</p>
        <p className="text-xs text-slate-500">
          Placed on {new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>
      
      {order.status === 'pending_payment' && onContinuePayment && (
        <Button 
          className="w-full rounded-xl" 
          onClick={() => onContinuePayment(order)}
        >
          Continue Payment
        </Button>
      )}
    </Card>
  );
}
