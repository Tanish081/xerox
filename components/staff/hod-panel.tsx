'use client';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { supabaseBrowser } from '@/lib/supabase';
import { displayToken } from '@/lib/token';
import type { Order, OrderStatus } from '@/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

type HodOrder = Order & { shop?: { id: string; name: string } };

type Summary = {
  totalOrders: number;
  billableOrders: number;
  totalSpend: number;
  outstanding: number;
  settled: number;
  totalPages: number;
  byStatus: Record<string, number>;
};

const STATUS_FILTERS: { key: 'all' | OrderStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending_hod_approval', label: 'With HOD' },
  { key: 'pending_approval', label: 'With operator' },
  { key: 'queued', label: 'Queued' },
  { key: 'processing', label: 'Printing' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

/** HOD approvals queue or department history, embedded in the staff dashboard. */
export function HodPanel({
  mode,
  onPendingCountChange,
}: {
  mode: 'approvals' | 'history';
  /** Called with the live pending-approval count whenever this panel (re)loads in approvals mode. */
  onPendingCountChange?: (count: number) => void;
}) {
  const [orders, setOrders] = useState<HodOrder[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    if (!session?.access_token) {
      setLoading(false);
      setMessage('Your session expired. Please sign in again.');
      return;
    }

    const scope = mode === 'history' ? 'history' : 'pending';
    const res = await fetch(`/api/hod/orders?scope=${scope}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    const payload = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage(payload.error ?? 'Unable to load requests.');
      return;
    }

    setMessage('');
    setOrders(payload.data ?? []);
    setSummary(payload.summary ?? null);
    if (mode === 'approvals') onPendingCountChange?.((payload.data ?? []).length);
  }, [mode, onPendingCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(orderId: string, action: 'approve' | 'reject') {
    setBusy(orderId);
    setMessage('');
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();

    const res = await fetch('/api/hod/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ orderId, action, reason: rejectDrafts[orderId] }),
    });
    const payload = await res.json();
    setBusy('');

    if (!res.ok) {
      setMessage(payload.error ?? 'Unable to record your decision.');
      return;
    }
    await load();
  }

  const visibleOrders = useMemo(
    () => (statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter],
  );

  return (
    <div className="space-y-4">
      {message ? <Card className="text-sm font-medium text-rose-600">{message}</Card> : null}

      {mode === 'history' && summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total spend', value: `₹${summary.totalSpend.toFixed(2)}`, hint: `${summary.billableOrders} billable` },
              { label: 'Outstanding', value: `₹${summary.outstanding.toFixed(2)}`, hint: 'Not yet settled' },
              { label: 'Settled', value: `₹${summary.settled.toFixed(2)}`, hint: 'Already paid for' },
              { label: 'Pages printed', value: summary.totalPages.toLocaleString('en-IN'), hint: `${summary.totalOrders} requests` },
            ].map((card) => (
              <Card key={card.label} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                <p className="text-2xl font-bold text-slate-950">{card.value}</p>
                <p className="text-xs text-slate-500">{card.hint}</p>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => {
              const count = filter.key === 'all' ? orders.length : summary.byStatus[filter.key] ?? 0;
              if (filter.key !== 'all' && count === 0) return null;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setStatusFilter(filter.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === filter.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filter.label} ({count})
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="space-y-3">
              <LoadingSkeleton className="h-5 w-24" />
              <LoadingSkeleton className="h-10 w-2/3" />
            </Card>
          ))}
        </div>
      ) : visibleOrders.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-600">
          {mode === 'approvals'
            ? 'No print requests are waiting for your approval.'
            : orders.length === 0
              ? 'No requests from your department yet.'
              : 'No requests match this filter.'}
        </Card>
      ) : mode === 'history' ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Placed by</th>
                <th className="px-4 py-3 text-right font-semibold">Pages</th>
                <th className="px-4 py-3 font-semibold">Operator (center)</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => {
                const when = new Date(order.created_at);
                return (
                  <tr key={order.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {when.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{order.placed_by_name || order.student?.name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{order.total_pages ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{order.shop?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">₹{Number(order.estimated_amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((order) => {
            const isBusy = busy === order.id;
            const awaiting = order.status === 'pending_hod_approval';
            const selfApproved = Boolean(order.hod_approved_by) && order.hod_approved_by === order.student_id;

            return (
              <Card key={order.id} className={`space-y-4 ${awaiting ? 'border-l-4 border-l-amber-500' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Token</div>
                    <div className="font-[var(--font-space-grotesk)] text-3xl font-bold text-slate-950">
                      {displayToken(order.token)}
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-800">{order.placed_by_name || order.student?.name || 'Staff member'}</p>
                    <p className="text-xs text-slate-500">
                      {order.shop?.name ?? 'Xerox center'} · {new Date(order.created_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="rounded-xl bg-slate-50 px-4 py-2 ring-1 ring-slate-200">
                      <p className="text-lg font-bold text-slate-900">{order.total_pages ?? '—'} pages</p>
                      <p className="text-xs text-slate-600">₹{Number(order.estimated_amount).toFixed(2)}</p>
                    </div>
                    <div className="mt-2">
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-2">
                  <div>Document: {order.file_name ?? 'Uploaded file'}</div>
                  <div>Copies: {order.print_settings?.copies ?? 1}</div>
                  <div>Colour: {order.print_settings?.color === 'color' ? 'Colour' : 'B/W'}</div>
                  <div>Size: {order.print_settings?.size ?? 'A4'}</div>
                  {order.print_settings?.notes ? <div className="sm:col-span-2">Notes: {order.print_settings.notes}</div> : null}
                </div>

                {selfApproved ? (
                  <p className="text-xs font-medium text-indigo-700">Your own request — auto-approved.</p>
                ) : order.hod_approved_at ? (
                  <p className="text-xs text-emerald-700">
                    ✓ You approved this on {new Date(order.hod_approved_at).toLocaleString('en-IN')}
                  </p>
                ) : null}

                {order.hod_rejection_reason ? (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                    Rejected: {order.hod_rejection_reason}
                  </p>
                ) : null}

                {order.department_settled_at ? (
                  <p className="text-xs text-slate-500">
                    Settled with the center on {new Date(order.department_settled_at).toLocaleDateString('en-IN')}
                  </p>
                ) : null}

                {awaiting ? (
                  <>
                    <Input
                      placeholder="Reason (required only if rejecting)"
                      value={rejectDrafts[order.id] ?? ''}
                      onChange={(e) => setRejectDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Button
                        variant="secondary"
                        className="rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={() => void decide(order.id, 'reject')}
                        disabled={isBusy}
                      >
                        {isBusy ? 'Saving…' : 'Reject'}
                      </Button>
                      <Button className="rounded-xl" onClick={() => void decide(order.id, 'approve')} disabled={isBusy}>
                        {isBusy ? 'Saving…' : 'Approve & send to operator'}
                      </Button>
                    </div>
                  </>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
