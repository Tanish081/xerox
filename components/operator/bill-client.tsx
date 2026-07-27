'use client';

import { supabaseBrowser } from '@/lib/supabase';
import type { Order } from '@/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type BillOrder = Order & { student?: { id: string; name: string } };

type Summary = {
  totalOrders: number;
  billableOrders: number;
  totalSpend: number;
  outstanding: number;
  settled: number;
  totalPages: number;
  byStatus: Record<string, number>;
};

type StatsResponse = {
  found: boolean;
  department: string | { id: string; name: string };
  shop?: { id: string; name: string; upiId?: string | null };
  data: BillOrder[];
  summary: Summary | null;
};

// Excluded from the bill itself — a job that was cancelled, never released by
// its HOD, or never got past the payment step was never actually printed.
const BILLABLE_STATUSES = new Set(['pending_approval', 'queued', 'processing', 'completed']);

function departmentName(dept: StatsResponse['department']) {
  return typeof dept === 'string' ? dept : dept.name;
}

export function BillClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const shopId = searchParams.get('shopId') ?? '';
  const department = searchParams.get('department') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!shopId || !department || !from || !to) {
        setLoading(false);
        setError('This bill link is missing required details. Generate it again from the Statistics tab.');
        return;
      }

      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (!session?.access_token) {
        setLoading(false);
        setError('Your session expired. Sign in again and re-generate the bill.');
        return;
      }

      const params = new URLSearchParams({ shopId, department, from, to });
      const res = await fetch(`/api/operator/department-stats?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = (await res.json()) as StatsResponse & { error?: string };
      if (cancelled) return;

      setLoading(false);
      if (!res.ok) {
        setError(payload.error ?? 'Unable to load the bill.');
        return;
      }
      setStats(payload);
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId, department, from, to]);

  if (loading) {
    return <div className="p-10 text-center text-sm text-slate-500">Preparing bill…</div>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-10 text-center">
        <p className="text-sm font-medium text-rose-600">{error}</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Back
        </button>
      </div>
    );
  }

  if (!stats?.found || !stats.summary) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-10 text-center">
        <p className="text-sm font-medium text-amber-700">
          {departmentName(stats?.department ?? department)} hasn&rsquo;t been set up in the system yet — there&rsquo;s nothing to bill.
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Back
        </button>
      </div>
    );
  }

  const billableRows = stats.data.filter((order) => BILLABLE_STATUSES.has(order.status)).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const totalPages = billableRows.reduce((sum, o) => sum + Number(o.total_pages ?? 0), 0);
  const totalAmount = billableRows.reduce((sum, o) => sum + Number(o.estimated_amount ?? 0), 0);

  const periodLabel = `${new Date(`${from}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(`${to}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  const invoiceNo = `${from.replace(/-/g, '')}-${to.replace(/-/g, '')}-${departmentName(stats.department).replace(/\s+/g, '').toUpperCase().slice(0, 6)}`;

  return (
    <div className="mx-auto max-w-3xl p-6 print:p-0">
      <div className="mb-6 flex justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-950">{stats.shop?.name ?? 'Xerox Center'}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">Print Service Bill</p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p>
              <span className="font-semibold text-slate-800">Invoice No:</span> {invoiceNo}
            </p>
            <p>
              <span className="font-semibold text-slate-800">Generated:</span> {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 border-b border-slate-200 py-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed to</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{departmentName(stats.department)} Department</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing period</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{periodLabel}</p>
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Date</th>
              <th className="py-2 pr-2 font-semibold">Placed by</th>
              <th className="py-2 pr-2 font-semibold">Document</th>
              <th className="py-2 pr-2 text-right font-semibold">Pages</th>
              <th className="py-2 pl-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {billableRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No billable print requests from {departmentName(stats.department)} in this period.
                </td>
              </tr>
            ) : (
              billableRows.map((order, index) => (
                <tr key={order.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2 text-slate-500">{index + 1}</td>
                  <td className="whitespace-nowrap py-2 pr-2 text-slate-700">
                    {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-2 pr-2 text-slate-700">{order.placed_by_name ?? order.student?.name ?? '—'}</td>
                  <td className="max-w-[220px] truncate py-2 pr-2 text-slate-700">{order.file_name ?? 'Document'}</td>
                  <td className="py-2 pr-2 text-right text-slate-900">{order.total_pages ?? '—'}</td>
                  <td className="py-2 pl-2 text-right font-medium text-slate-900">₹{Number(order.estimated_amount).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-800 text-sm font-semibold text-slate-950">
              <td colSpan={4} className="py-3 text-right">
                Total
              </td>
              <td className="py-3 text-right">{totalPages}</td>
              <td className="py-3 pl-2 text-right">₹{totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-700">
              <span>Total billed</span>
              <span className="font-semibold text-slate-900">₹{stats.summary.totalSpend.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span>Settled</span>
              <span className="font-semibold">₹{stats.summary.settled.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-950">
              <span>Outstanding</span>
              <span>₹{stats.summary.outstanding.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-end justify-between border-t border-slate-200 pt-6 text-xs text-slate-500">
          <div>
            {stats.shop?.upiId ? <p>Payments to UPI ID: {stats.shop.upiId}</p> : null}
            <p className="mt-1">This is a system-generated bill from PrintQ.</p>
          </div>
          <div className="text-right">
            <div className="mb-8 h-px w-40 border-b border-slate-400" />
            <p>Authorised signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
