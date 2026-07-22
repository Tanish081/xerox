'use client';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { useCallback, useEffect, useState } from 'react';

type PaymentRequest = {
  id: string;
  department: string;
  amount: number;
  order_count: number;
  status: 'pending' | 'settled';
  note: string | null;
  created_at: string;
  settled_at: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
  creditLimit: number;
  used: number;
  orderCount: number;
  remaining: number;
  limitReached: boolean;
  pendingRequest: PaymentRequest | null;
};

export function DepartmentBillingPanel({ shopId, authToken }: { shopId: string; authToken: string }) {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busyDepartment, setBusyDepartment] = useState('');
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!shopId || !authToken) return;

    setLoading(true);
    const response = await fetch(`/api/operator/department-billing?shopId=${encodeURIComponent(shopId)}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      cache: 'no-store',
    });

    const payload = (await response.json()) as { data?: DepartmentRow[]; error?: string };
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? 'Unable to load department billing.');
      return;
    }

    setMessage('');
    setDepartments(payload.data ?? []);
  }, [shopId, authToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function raiseRequest(departmentId: string) {
    setBusyDepartment(departmentId);
    setMessage('');

    const response = await fetch('/api/operator/department-billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ shopId, departmentId }),
    });

    const payload = await response.json();
    setBusyDepartment('');

    if (!response.ok) {
      setMessage(payload.error ?? 'Unable to raise the payment request.');
      return;
    }

    await load();
  }

  async function settleRequest(requestId: string, departmentId: string) {
    setBusyDepartment(departmentId);
    setMessage('');

    const response = await fetch('/api/operator/department-billing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ shopId, requestId }),
    });

    const payload = await response.json();
    setBusyDepartment('');

    if (!response.ok) {
      setMessage(payload.error ?? 'Unable to settle the payment request.');
      return;
    }

    await load();
  }

  async function saveLimit(departmentId: string) {
    const raw = limitDrafts[departmentId];
    const creditLimit = Number(raw);

    if (!raw || !Number.isFinite(creditLimit) || creditLimit < 0) {
      setMessage('Enter a valid credit limit.');
      return;
    }

    setBusyDepartment(departmentId);
    setMessage('');

    const response = await fetch('/api/operator/department-billing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ shopId, departmentId, creditLimit }),
    });

    const payload = await response.json();
    setBusyDepartment('');

    if (!response.ok) {
      setMessage(payload.error ?? 'Unable to update the credit limit.');
      return;
    }

    setLimitDrafts((prev) => {
      const next = { ...prev };
      delete next[departmentId];
      return next;
    });
    await load();
  }

  return (
    <Card className="space-y-4 border border-slate-100 bg-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Staff billing</p>
          <h3 className="text-lg font-semibold text-slate-950">Department credit</h3>
        </div>
        <Button variant="secondary" className="rounded-full px-4 py-2 text-xs" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {message ? <p className="text-sm font-medium text-rose-600">{message}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading departments…</p>
      ) : departments.length === 0 ? (
        <p className="text-sm text-slate-500">No staff have ordered from a department at this shop yet.</p>
      ) : (
        <div className="space-y-3">
          {departments.map((row) => {
            const percent = row.creditLimit > 0 ? Math.min(100, (row.used / row.creditLimit) * 100) : 0;
            const busy = busyDepartment === row.id;

            return (
              <div
                key={row.id}
                className={`space-y-3 rounded-2xl border p-4 ${row.limitReached ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{row.name}</p>
                    <p className="text-xs text-slate-500">
                      {row.orderCount} unbilled order{row.orderCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      ₹{row.used.toFixed(2)} <span className="font-normal text-slate-500">/ ₹{row.creditLimit.toFixed(2)}</span>
                    </p>
                    <p className={`text-xs font-semibold ${row.limitReached ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {row.limitReached ? 'Limit reached' : `₹${row.remaining.toFixed(2)} left`}
                    </p>
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${row.limitReached ? 'bg-rose-500' : 'bg-brand-600'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {row.pendingRequest ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                    <span>
                      Payment request sent for ₹{Number(row.pendingRequest.amount).toFixed(2)} ({row.pendingRequest.order_count} orders) —
                      awaiting settlement.
                    </span>
                    <Button
                      className="rounded-full px-3 py-1.5 text-xs"
                      onClick={() => void settleRequest(row.pendingRequest!.id, row.id)}
                      disabled={busy}
                    >
                      {busy ? 'Saving…' : 'Mark settled'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="rounded-xl px-4 py-2 text-xs"
                    onClick={() => void raiseRequest(row.id)}
                    disabled={busy || row.orderCount === 0}
                  >
                    {busy ? 'Sending…' : 'Send payment request to department'}
                  </Button>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-slate-600" htmlFor={`limit-${row.id}`}>
                    Credit limit ₹
                  </label>
                  <Input
                    id={`limit-${row.id}`}
                    className="h-9 w-32 text-sm"
                    inputMode="decimal"
                    value={limitDrafts[row.id] ?? String(row.creditLimit)}
                    onChange={(event) => setLimitDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))}
                  />
                  <Button
                    variant="secondary"
                    className="rounded-full px-3 py-1.5 text-xs"
                    onClick={() => void saveLimit(row.id)}
                    disabled={busy || limitDrafts[row.id] === undefined}
                  >
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
