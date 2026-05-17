"use client";

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { OperatorOrderCardPolished } from '@/components/operator/order-card-polished';
import type { Order, Shop } from '@/types';
import { displayToken } from '@/lib/token';
import { useEffect, useMemo, useState } from 'react';

type OperatorShop = Pick<Shop, 'id' | 'name' | 'is_open' | 'operator_email'>;

export function OperatorDashboardClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [shop, setShop] = useState<Pick<Shop, 'id' | 'name' | 'is_open'>>({ id: '', name: '', is_open: false });
  const [availableShops, setAvailableShops] = useState<OperatorShop[]>([]);
  const [operatorEmail, setOperatorEmail] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [statusMessage, setStatusMessage] = useState('Resolving operator shop...');
  const [loading, setLoading] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);

  useEffect(() => {
    async function resolveOperatorShop() {
      const { supabaseBrowser } = await import('@/lib/supabase');
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      const {
        data: { user },
        error: userError,
      } = await supabaseBrowser.auth.getUser();

      const token = session?.access_token ?? '';
      setAuthToken(token);

      if (userError || !user?.email || !token) {
        setStatusMessage('Sign in as operator to load your queue.');
        setLoading(false);
        return;
      }

      const normalizedOperatorEmail = user.email.toLowerCase();

      const response = await fetch('/api/operator/shops', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json()) as { data?: OperatorShop[]; error?: string; operatorEmail?: string };

      if (!response.ok) {
        setStatusMessage(payload.error ?? 'No shop data available for this operator.');
        setLoading(false);
        return;
      }

      const shops = payload.data ?? [];
      setAvailableShops(shops);
      setOperatorEmail(payload.operatorEmail ?? normalizedOperatorEmail);

      const matchingShop = shops.find((candidate) => candidate.operator_email?.toLowerCase() === normalizedOperatorEmail) ?? shops.find((candidate) => candidate.is_open) ?? shops[0];

      if (!matchingShop) {
        setStatusMessage('No shops found in the database.');
        setLoading(false);
        return;
      }

      setShop({ id: matchingShop.id, name: matchingShop.name, is_open: matchingShop.is_open });
      setStatusMessage(
        matchingShop.operator_email?.toLowerCase() === normalizedOperatorEmail
          ? ''
          : 'No shop is assigned to this email yet. Using the selected shop below.',
      );
      setLoading(false);
    }

    void resolveOperatorShop();
  }, []);

  async function loadOrders(shopId = shop.id) {
    if (!shopId || !authToken) return;

    const response = await fetch(`/api/operator/orders?shopId=${encodeURIComponent(shopId)}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const payload = (await response.json()) as { data?: Order[]; error?: string };

    if (!response.ok) {
      setStatusMessage(payload.error ?? 'Unable to load orders.');
      return;
    }

    setOrders((payload.data ?? []) as Order[]);
  }

  useEffect(() => {
    void loadOrders();
  }, [shop.id, authToken]);

  const pending = useMemo(() => orders.filter((order) => order.status === 'pending_approval'), [orders]);
  const active = useMemo(() => orders.filter((order) => order.status === 'queued' || order.status === 'processing'), [orders]);
  const completedToday = useMemo(() => orders.filter((order) => order.status === 'completed'), [orders]);

  async function toggleShopOpen() {
    if (!shop.id) return;

    setToggleLoading(true);
    const response = await fetch(`/api/shops/${shop.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_open: !shop.is_open }),
    });

    const payload = (await response.json()) as { data?: Shop; error?: string };
    setToggleLoading(false);

    if (!response.ok) {
      setStatusMessage(payload.error ?? 'Unable to update shop status.');
      return;
    }

    const updatedShop = payload.data;
    if (updatedShop) {
      setShop({ id: updatedShop.id, name: updatedShop.name, is_open: updatedShop.is_open });
      return;
    }

    setShop((current) => ({ ...current, is_open: !current.is_open }));
  }

  async function handleApproveOrder(id: string) {
    await fetch('/api/operator/orders', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ orderId: id, status: 'queued' }),
    });
    await loadOrders();
  }

  async function handleRejectOrder(id: string, reason: string) {
    await fetch('/api/operator/orders', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ orderId: id, status: 'cancelled', rejectionReason: reason }),
    });
    await loadOrders();
  }

  async function handleProcessOrder(id: string) {
    await fetch('/api/operator/orders', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ orderId: id, status: 'processing' }),
    });
    await loadOrders();
  }

  async function handleCompleteOrder(id: string) {
    await fetch('/api/operator/orders', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ orderId: id, status: 'completed' }),
    });
    await loadOrders();
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 bg-slate-950 text-white lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-slate-300">Operator dashboard</p>
          <h2 className="text-3xl font-semibold tracking-tight">{shop.name || 'Resolving shop...'}</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="rounded-full px-4 py-2 text-xs text-slate-900 bg-white hover:bg-slate-100" onClick={() => window.location.href = `/operator/inventory?shop_id=${shop.id}`} disabled={!shop.id}>
            Inventory
          </Button>
          <Button variant="secondary" className="rounded-full px-4 py-2 text-xs" onClick={() => void toggleShopOpen()} disabled={toggleLoading || !shop.id}>
            {shop.is_open ? 'Close Shop' : 'Open Shop'}
          </Button>
        </div>
      </Card>

      {statusMessage ? <Card className="text-sm font-medium text-slate-700">{statusMessage}</Card> : null}

      {availableShops.length > 0 ? (
        <Card className="space-y-4 border border-slate-100 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Shop picker</p>
              <h3 className="text-lg font-semibold text-slate-950">Choose a shop to manage</h3>
            </div>
            <p className="text-xs text-slate-500">Logged in as {operatorEmail || 'operator'}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableShops.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => {
                  setShop({ id: candidate.id, name: candidate.name, is_open: candidate.is_open });
                  setStatusMessage('');
                }}
                className={`rounded-2xl border p-4 text-left transition ${candidate.id === shop.id ? 'border-brand-300 bg-brand-50/70 shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-brand-200 hover:bg-brand-50/40'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{candidate.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{candidate.operator_email}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${candidate.is_open ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {candidate.is_open ? 'Open' : 'Closed'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, columnIndex) => (
            <Card key={columnIndex} className="space-y-3">
              <LoadingSkeleton className="h-5 w-32" />
              <LoadingSkeleton className="h-40 w-full" />
              <LoadingSkeleton className="h-40 w-full" />
            </Card>
          ))}
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Pending Approval</h3>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">{pending.length}</span>
            </div>
            <div className="space-y-4">
              {pending.map((order) => (
                <OperatorOrderCardPolished
                  key={order.id}
                  order={order}
                  onApprove={handleApproveOrder}
                  onReject={handleRejectOrder}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Active Queue</h3>
              <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">{active.length}</span>
            </div>
            <div className="space-y-4">
              {active.map((order) => (
                <OperatorOrderCardPolished
                  key={order.id}
                  order={order}
                  onProcess={handleProcessOrder}
                  onComplete={handleCompleteOrder}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Completed Today</h3>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">{completedToday.length}</span>
            </div>
            <Card>
              <div className="space-y-3">
                {completedToday.map((order) => (
                  <div key={order.id} className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-950">{displayToken(order.token)}</span>
                      <span>{order.file_name ?? 'Document'}</span>
                    </div>
                  </div>
                ))}
                {completedToday.length === 0 ? <p className="text-sm text-slate-500">No completed orders yet.</p> : null}
              </div>
            </Card>
          </section>
        </div>
      ) : null}
    </div>
  );
}