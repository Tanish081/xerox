'use client';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/input';
import { Label } from '@/components/shared/label';
import { StatusBadge } from '@/components/shared/status-badge';
import { COLLEGE_DEPARTMENTS } from '@/lib/college-departments';
import type { Order } from '@/types';
import { useCallback, useEffect, useState } from 'react';

type StatsOrder = Order & { student?: { id: string; name: string } };

type Summary = {
  totalOrders: number;
  billableOrders: number;
  totalSpend: number;
  outstanding: number;
  settled: number;
  totalPages: number;
  byStatus: Record<string, number>;
};

type Settlement = { id: string; amount: number; note: string | null; created_at: string };

type StatsResponse = {
  found: boolean;
  department: string | { id: string; name: string };
  data: StatsOrder[];
  summary: Summary | null;
  settlements: Settlement[];
};

/**
 * Department-wise print statistics for the operator's current shop. Any
 * department in the college roster can be picked, but only ones actually set
 * up in the system (currently just AIDS) return real data — the rest show a
 * "not set up yet" state rather than disappearing from the list.
 */
export function DepartmentStatsPanel({ shopId, authToken }: { shopId: string; authToken: string }) {
  const [department, setDepartment] = useState<string>('');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [billFrom, setBillFrom] = useState('');
  const [billTo, setBillTo] = useState('');
  const [billError, setBillError] = useState('');

  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [settleError, setSettleError] = useState('');
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    if (!shopId || !authToken || !department) return;

    setLoading(true);
    setMessage('');
    const res = await fetch(
      `/api/operator/department-stats?shopId=${encodeURIComponent(shopId)}&department=${encodeURIComponent(department)}`,
      { headers: { Authorization: `Bearer ${authToken}` }, cache: 'no-store' },
    );
    const payload = (await res.json()) as StatsResponse & { error?: string };
    setLoading(false);

    if (!res.ok) {
      setMessage(payload.error ?? 'Unable to load statistics.');
      setStats(null);
      return;
    }

    setStats(payload);
  }, [shopId, authToken, department]);

  useEffect(() => {
    void load();
  }, [load]);

  function generateBill() {
    setBillError('');

    if (!department) {
      setBillError('Select a department first.');
      return;
    }
    if (!stats?.found) {
      setBillError(`${department} hasn't been set up in the system yet — there's nothing to bill.`);
      return;
    }
    if (!billFrom || !billTo) {
      setBillError('Choose both a from and a to date.');
      return;
    }
    if (billFrom > billTo) {
      setBillError('The from date must be before the to date.');
      return;
    }

    const params = new URLSearchParams({ shopId, department, from: billFrom, to: billTo });
    window.open(`/operator/bill?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  async function settleUp() {
    setSettleError('');

    if (!department) {
      setSettleError('Select a department first.');
      return;
    }
    if (!stats?.found) {
      setSettleError(`${department} hasn't been set up in the system yet.`);
      return;
    }

    const amount = Number(settleAmount);
    if (!settleAmount || !Number.isFinite(amount) || amount <= 0) {
      setSettleError('Enter a valid amount received.');
      return;
    }

    setSettling(true);
    const res = await fetch('/api/operator/department-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ shopId, department, amount, note: settleNote.trim() || undefined }),
    });
    const payload = await res.json();
    setSettling(false);

    if (!res.ok) {
      setSettleError(payload.error ?? 'Unable to record the settlement.');
      return;
    }

    setSettleAmount('');
    setSettleNote('');
    await load();
  }

  return (
    <Card className="space-y-5 border border-slate-100 bg-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Statistics</p>
        <h3 className="text-lg font-semibold text-slate-950">Department-wise statistics</h3>
        <p className="mt-1 text-xs text-slate-500">Pick a department to see its print activity at this center.</p>
      </div>

      <div>
        <Label htmlFor="statsDepartment">Department</Label>
        <select
          id="statsDepartment"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-900 ring-1 ring-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">Select a department…</option>
          {COLLEGE_DEPARTMENTS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {message ? <p className="text-sm font-medium text-rose-600">{message}</p> : null}

      {!department ? null : loading ? (
        <p className="text-sm text-slate-500">Loading statistics…</p>
      ) : stats && !stats.found ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          {department} hasn&rsquo;t been set up in the system yet — no data to show.
        </div>
      ) : stats?.summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total spend', value: `₹${stats.summary.totalSpend.toFixed(2)}`, hint: `${stats.summary.billableOrders} billable` },
              { label: 'Outstanding', value: `₹${stats.summary.outstanding.toFixed(2)}`, hint: 'Not yet settled' },
              { label: 'Settled', value: `₹${stats.summary.settled.toFixed(2)}`, hint: 'Already paid for' },
              { label: 'Pages printed', value: stats.summary.totalPages.toLocaleString('en-IN'), hint: `${stats.summary.totalOrders} requests` },
            ].map((card) => (
              <Card key={card.label} className="space-y-1 bg-slate-50">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                <p className="text-xl font-bold text-slate-950">{card.value}</p>
                <p className="text-[11px] text-slate-500">{card.hint}</p>
              </Card>
            ))}
          </div>

          <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settle up</p>
            <p className="text-xs text-slate-500">
              Record an amount received from {department} — it updates Settled and Outstanding above and on any bill you generate.
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
              <div>
                <Label htmlFor="settleAmount">Amount received (₹)</Label>
                <Input
                  id="settleAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 2000"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="settleNote">Note (optional)</Label>
                <Input
                  id="settleNote"
                  placeholder="e.g. Cash from accounts office"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button className="w-full rounded-xl sm:w-auto" onClick={() => void settleUp()} disabled={settling}>
                  {settling ? 'Saving…' : 'Settle Up'}
                </Button>
              </div>
            </div>
            {settleError ? <p className="text-sm font-medium text-rose-600">{settleError}</p> : null}

            {stats.settlements.length > 0 ? (
              <div className="space-y-1.5 border-t border-slate-200 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent settlements</p>
                {stats.settlements.slice(0, 5).map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                    <span>
                      {new Date(row.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {row.note ? ` — ${row.note}` : ''}
                    </span>
                    <span className="font-semibold text-slate-900">₹{Number(row.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {stats.data.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No print requests from {department} yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Placed by</th>
                    <th className="px-4 py-3 text-right font-semibold">Pages</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.data.map((order) => {
                    const when = new Date(order.created_at);
                    return (
                      <tr key={order.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {when.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{order.placed_by_name ?? order.student?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{order.total_pages ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">₹{Number(order.estimated_amount).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={order.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Generate bill</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <Label htmlFor="billFrom">From</Label>
                <Input id="billFrom" type="date" value={billFrom} onChange={(e) => setBillFrom(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="billTo">To</Label>
                <Input id="billTo" type="date" value={billTo} onChange={(e) => setBillTo(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="w-full rounded-xl sm:w-auto" onClick={generateBill}>
                  Generate Bill
                </Button>
              </div>
            </div>
            {billError ? <p className="text-sm font-medium text-rose-600">{billError}</p> : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}
