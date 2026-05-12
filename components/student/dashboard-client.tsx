"use client";

import { BottomSheet } from '@/components/shared/bottom-sheet';
import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { StudentOrderCard } from '@/components/student/order-card';
import { StudentShopCard } from '@/components/student/shop-card';
import { clearSelectedShop, clearStudentSession, getStudentSession, setSelectedShop } from '@/lib/student-session';
import { ensureStudentFlowReady } from '@/lib/student-route-guard';
import type { Order } from '@/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ShopPickerShop } from '@/lib/shops';

export function StudentDashboardClient() {
  const router = useRouter();
  const [studentId, setStudentId] = useState('');
  const [shopId, setShopId] = useState('');
  const [shopName, setShopName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [openShops, setOpenShops] = useState<ShopPickerShop[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function gate() {
      const ok = await ensureStudentFlowReady(router);
      if (!ok || cancelled) return;

      const session = getStudentSession();
      if (!session?.studentId) return;

      setStudentId(session.studentId);
      setShopId(session.shopId);
      setShopName(session.shopName);
      setStudentName(session.studentName);
    }

    void gate();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    async function loadShops() {
      try {
        const response = await fetch('/api/student/shops');
        const payload = (await response.json()) as { data?: ShopPickerShop[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load xerox centers.');
        }

        setOpenShops(payload.data ?? []);
      } catch {
        setOpenShops([]);
      }
    }

    void loadShops();
  }, []);

  useEffect(() => {
    async function loadOrders() {
      if (!studentId) return;
      setLoadingOrders(true);
      const { supabaseBrowser } = await import('@/lib/supabase');
      const { data, error } = await supabaseBrowser.from('orders').select('*').eq('student_id', studentId).order('created_at', { ascending: false });
      if (error) {
        setStatusMessage(error.message);
        setLoadingOrders(false);
        return;
      }
      setOrders((data ?? []) as Order[]);
      setLoadingOrders(false);
    }

    void loadOrders();

    if (!studentId) return;

    (async () => {
      const { supabaseBrowser: sb } = await import('@/lib/supabase');
      const channel = sb
        .channel(`student-orders-${studentId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `student_id=eq.${studentId}` }, () => {
          void loadOrders();
        })
        .subscribe();

      return () => {
        void sb.removeChannel(channel);
      };
    })();
  }, [studentId]);

  const activeOrder = useMemo(() => orders.find((order) => order.token && order.status !== 'completed' && order.status !== 'cancelled') ?? null, [orders]);
  const historyOrders = useMemo(() => orders.filter((order) => order.id !== activeOrder?.id), [activeOrder?.id, orders]);

  return (
    <div className="space-y-6">
      <Card className="sticky top-3 z-20 flex items-center justify-between gap-4 border border-slate-100 bg-white/95 backdrop-blur">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">{shopName || 'Selected center'}</p>
          <h2 className="text-lg font-semibold text-slate-950">Hi, {studentName || 'Student'}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            className="rounded-full px-4 py-2 text-xs"
            onClick={() => void (async () => {
              const { supabaseBrowser } = await import('@/lib/supabase');
              await supabaseBrowser.auth.signOut();
              clearStudentSession();
              clearSelectedShop();
              router.replace('/student/login');
            })()}
          >
            Sign out
          </Button>
          <Button variant="secondary" className="rounded-full px-4 py-2 text-xs" onClick={() => setIsSwitcherOpen(true)}>
            Change Center
          </Button>
          <Button variant="secondary" className="rounded-full px-4 py-2 text-xs" onClick={() => router.push('/student/storefront')}>
            Shop Stationery
          </Button>
          <Button className="rounded-full px-4 py-2 text-xs" onClick={() => router.push('/student/new-order')}>
            Place new order
          </Button>
        </div>
      </Card>

      {statusMessage ? <Card className="text-sm font-medium text-slate-700">{statusMessage}</Card> : null}

      {activeOrder ? (
        <Card className="overflow-hidden border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-slate-50 p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-700">Active order</p>
                <div className="font-[var(--font-space-grotesk)] text-7xl font-bold tracking-tight text-brand-700">{activeOrder.token ?? '--'}</div>
              </div>
              <StatusBadge status={activeOrder.status} />
              <div className="space-y-1 text-sm text-slate-600">
                <p>{activeOrder.file_name ?? 'Document upload'}</p>
                <p>Estimated ready: {activeOrder.estimated_ready_time ? new Date(activeOrder.estimated_ready_time).toLocaleString('en-IN') : 'Calculating...'}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
              <p className="font-semibold text-slate-900">Show this token at the counter</p>
              <p className="mt-1">Your order is live and updates automatically.</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="space-y-3 text-center">
          <p className="text-lg font-semibold text-slate-950">No orders yet. Start by uploading a file →</p>
          <Button onClick={() => router.push('/student/new-order')}>Start a new order</Button>
        </Card>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Order history</h3>

        {loadingOrders ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="space-y-3">
                <LoadingSkeleton className="h-5 w-20" />
                <LoadingSkeleton className="h-10 w-2/3" />
                <LoadingSkeleton className="h-4 w-1/2" />
              </Card>
            ))}
          </div>
        ) : null}

        {!loadingOrders && historyOrders.length > 0 ? (
          <div className="space-y-4">
            {historyOrders.map((order) => {
              if (order.status === 'cancelled') {
                return (
                  <Card key={order.id} className="space-y-3 border border-rose-100 bg-rose-50/70">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-rose-700">Token</div>
                        <div className="font-[var(--font-space-grotesk)] text-3xl font-bold text-slate-950">{order.token ?? '--'}</div>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-rose-700">Reason: {order.rejection_reason ?? 'Order rejected by operator. Please retry with corrected files.'}</p>
                  </Card>
                );
              }

              return <StudentOrderCard key={order.id} order={order} />;
            })}
          </div>
        ) : null}
      </div>

      <BottomSheet open={isSwitcherOpen} onClose={() => setIsSwitcherOpen(false)} title="Change Center">
        <div className="grid gap-3 sm:grid-cols-2">
          {openShops.map((shop) => (
            <StudentShopCard
              key={shop.id}
              shop={shop}
              selected={shop.id === shopId}
              onClick={() => {
                if (shop.id === shopId) {
                  setIsSwitcherOpen(false);
                  return;
                }

                setSelectedShop({
                  id: shop.id,
                  name: shop.name,
                  upi_id: shop.upi_id,
                  avg_time_per_10_pages: shop.avg_time_per_10_pages,
                });
                clearStudentSession();
                setIsSwitcherOpen(false);
                router.push('/student/identify');
              }}
            />
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
