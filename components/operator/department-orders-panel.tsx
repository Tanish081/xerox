'use client';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { displayToken } from '@/lib/token';
import { buildDepartmentOrderDoneWhatsAppUrl } from '@/lib/whatsapp';
import type { Order } from '@/types';
import { useMemo, useState } from 'react';

type Props = {
  orders: Order[];
  shopName: string;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onProcess: (id: string) => Promise<void>;
  onMarkDone: (id: string) => Promise<void>;
};

/**
 * Operator view of staff (department-billed) orders: accept, print, then mark
 * done — which hands over a prefilled WhatsApp message for the staff member.
 */
export function DepartmentOrdersPanel({ orders, shopName, onAccept, onReject, onProcess, onMarkDone }: Props) {
  const [busy, setBusy] = useState('');
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});

  const departmentOrders = useMemo(
    () => orders.filter((order) => order.billing_mode === 'department_credit'),
    [orders],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of departmentOrders) {
      const key = order.billed_department || 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), order]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [departmentOrders]);

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy('');
    }
  }

  if (departmentOrders.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-slate-600">
        No department print requests yet. Staff orders appear here once submitted.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([department, deptOrders]) => {
        const awaitingHod = deptOrders.filter((o) => o.status === 'pending_hod_approval');
        const toAccept = deptOrders.filter((o) => o.status === 'pending_approval');
        const inProgress = deptOrders.filter((o) => o.status === 'queued' || o.status === 'processing');
        const done = deptOrders.filter((o) => o.status === 'completed');

        return (
          <Card key={department} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h3 className="text-lg font-semibold text-slate-950">{department}</h3>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                {awaitingHod.length > 0 ? (
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-700">{awaitingHod.length} with HOD</span>
                ) : null}
                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">{toAccept.length} to accept</span>
                <span className="rounded-full bg-brand-100 px-3 py-1 text-brand-700">{inProgress.length} printing</span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">{done.length} done</span>
              </div>
            </div>

            <div className="space-y-3">
              {deptOrders.map((order) => {
                const isBusy = busy === order.id;
                const whatsappUrl = buildDepartmentOrderDoneWhatsAppUrl(order, shopName);

                return (
                  <div key={order.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-[var(--font-space-grotesk)] text-2xl font-bold text-slate-950">
                          {displayToken(order.token)}
                        </div>
                        <p className="text-sm font-medium text-slate-800">{order.student?.name ?? 'Staff member'}</p>
                        <p className="text-xs text-slate-500">{order.file_name ?? 'Document'}</p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={order.status} />
                        <p className="mt-1 text-xs text-slate-600">
                          {order.total_pages ? `${order.total_pages} pages · ` : ''}₹{Number(order.estimated_amount).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {order.status === 'pending_hod_approval' ? (
                      <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800 ring-1 ring-indigo-200">
                        Waiting on the {department} HOD. It reaches your queue once approved.
                      </p>
                    ) : null}

                    {order.hod_approved_at ? (
                      <p className="text-xs text-emerald-700">
                        ✓ HOD approved on {new Date(order.hod_approved_at).toLocaleString('en-IN')}
                      </p>
                    ) : null}

                    {order.status === 'pending_approval' ? (
                      <div className="space-y-2">
                        <input
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                          placeholder="Reason (only if rejecting)"
                          value={rejectDrafts[order.id] ?? ''}
                          onChange={(e) => setRejectDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))}
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button
                            variant="secondary"
                            className="rounded-xl border border-rose-200 text-xs text-rose-700 hover:bg-rose-50"
                            onClick={() => void run(order.id, () => onReject(order.id, rejectDrafts[order.id] ?? 'Rejected by operator.'))}
                            disabled={isBusy}
                          >
                            Reject
                          </Button>
                          <Button className="rounded-xl text-xs" onClick={() => void run(order.id, () => onAccept(order.id))} disabled={isBusy}>
                            {isBusy ? 'Saving…' : 'Accept'}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {order.status === 'queued' ? (
                      <Button className="rounded-xl text-xs" onClick={() => void run(order.id, () => onProcess(order.id))} disabled={isBusy}>
                        {isBusy ? 'Saving…' : 'Start printing'}
                      </Button>
                    ) : null}

                    {order.status === 'processing' ? (
                      <Button className="rounded-xl text-xs" onClick={() => void run(order.id, () => onMarkDone(order.id))} disabled={isBusy}>
                        {isBusy ? 'Saving…' : 'Mark as done'}
                      </Button>
                    ) : null}

                    {order.status === 'completed' ? (
                      whatsappUrl ? (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <span aria-hidden>💬</span> Send collection message on WhatsApp
                        </a>
                      ) : (
                        <p className="text-xs text-amber-700">
                          No usable phone number on file — notify {order.student?.name ?? 'the staff member'} directly.
                        </p>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
