"use client";

import { BottomSheet } from '@/components/shared/bottom-sheet';
import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { HodPanel } from '@/components/staff/hod-panel';
import { StudentOrderCard } from '@/components/student/order-card';
import { StudentShopCard } from '@/components/student/shop-card';
import { clearSelectedShop, clearStudentSession, getStudentSession, setSelectedShop } from '@/lib/student-session';
import { ensureStudentFlowReady } from '@/lib/student-route-guard';
import type { Order } from '@/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ShopPickerShop } from '@/lib/shops';
import { displayToken } from '@/lib/token';
import { calculateEstimatedReadyTime } from '@/lib/queue';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
    };
  }
}

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
  const [resumingPayment, setResumingPayment] = useState(false);
  // Staff are billed to their department, so they never get a payment prompt.
  const [isStaff, setIsStaff] = useState(false);
  // Role-based: an account is HOD when its email is a department's hod_email.
  const [isHod, setIsHod] = useState(false);
  const [hodDepartment, setHodDepartment] = useState('');
  const [tab, setTab] = useState<'orders' | 'approvals' | 'history'>('orders');

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
      setIsStaff(session.userType === 'staff');

      // Ask the server whether this signed-in email holds the HOD role.
      const { supabaseBrowser } = await import('@/lib/supabase');
      const {
        data: { session: authSession },
      } = await supabaseBrowser.auth.getSession();
      if (cancelled || !authSession?.access_token) return;

      const res = await fetch('/api/staff/role', {
        headers: { Authorization: `Bearer ${authSession.access_token}` },
        cache: 'no-store',
      });
      if (cancelled || !res.ok) return;
      const role = (await res.json()) as { isHod?: boolean; department?: { name?: string } | null };
      if (cancelled) return;
      setIsHod(Boolean(role.isHod));
      setHodDepartment(role.department?.name ?? '');
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
    if (!studentId) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sbRef: any = null;
    let cancelled = false;

    async function loadOrders() {
      if (cancelled) return;
      setLoadingOrders(true);
      const { supabaseBrowser } = await import('@/lib/supabase');
      const { data, error } = await supabaseBrowser
        .from('orders')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setStatusMessage(error.message);
        setLoadingOrders(false);
        return;
      }
      setOrders((data ?? []) as Order[]);
      setLoadingOrders(false);
    }

    void loadOrders();

    (async () => {
      const { supabaseBrowser: sb } = await import('@/lib/supabase');
      sbRef = sb;
      if (cancelled) return;
      channel = sb
        .channel(`student-orders-${studentId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `student_id=eq.${studentId}` }, () => {
          void loadOrders();
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (sbRef && channel) {
        void sbRef.removeChannel(channel);
      }
    };
  }, [studentId]);

  const activeOrder = useMemo(() => orders.find((order) => order.token && order.status !== 'completed' && order.status !== 'cancelled') ?? null, [orders]);
  const historyOrders = useMemo(() => orders.filter((order) => order.id !== activeOrder?.id), [activeOrder?.id, orders]);

  const loadRazorpayScript = async () => {
    if (window.Razorpay) return;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Razorpay checkout script.'));
      document.body.appendChild(script);
    });
  };

  const handleContinuePayment = async (order: Order) => {
    try {
      setResumingPayment(true);
      setStatusMessage('');
      await loadRazorpayScript();

      // Stationery cart from JSONB
      const stationaryCart = Array.isArray(order.stationary_cart) ? order.stationary_cart : [];
      
      // Calculate total amount (should already be in estimated_amount, but let's be safe)
      const amount = Number(order.estimated_amount);

      const createOrderResponse = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          receipt: order.id,
        }),
      });

      const createOrderPayload = await createOrderResponse.json();
      if (!createOrderResponse.ok) {
        throw new Error(createOrderPayload.error || 'Unable to create payment order.');
      }

      const RazorpayCheckout = window.Razorpay;
      if (!RazorpayCheckout) throw new Error('Razorpay checkout is unavailable.');

      const razorpay = new RazorpayCheckout({
        key: createOrderPayload.key,
        amount: createOrderPayload.amount,
        currency: createOrderPayload.currency,
        name: 'PrintQ',
        description: `Order ${order.id}`,
        order_id: createOrderPayload.orderId,
        handler: async (response: any) => {
          try {
            setResumingPayment(true);
            const verifyResponse = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            });
            const verifyPayload = await verifyResponse.json();
            if (!verifyResponse.ok || !verifyPayload.verified) {
              throw new Error(verifyPayload.error || 'Payment verification failed.');
            }

            // After verification, submit the order (token is generated server-side)
            const { supabaseBrowser: sb } = await import('@/lib/supabase');

            let eta: Date | null = null;
            try {
              eta = await calculateEstimatedReadyTime(order.id, order.shop_id, sb as never);
            } catch {
              eta = null;
            }

            const submitResponse = await fetch('/api/student/orders/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: order.id,
                shopId: order.shop_id,
                studentId: order.student_id,
                paymentPath: null,
                utrNumber: response.razorpay_payment_id,
                estimatedReadyTime: eta ? eta.toISOString() : null,
                printAmount: amount,
                stationaryCart,
              })
            });

            if (!submitResponse.ok) {
              const err = await submitResponse.json();
              throw new Error(err.error || 'Failed to submit order');
            }

            setResumingPayment(false);
            // The dashboard will auto-refresh via Supabase real-time
          } catch (error: any) {
            setStatusMessage(error.message || 'Payment verification failed.');
            setResumingPayment(false);
          }
        },
        modal: {
          ondismiss: () => {
            setResumingPayment(false);
          },
        },
        theme: { color: '#2563eb' },
      });

      razorpay.open();
    } catch (error: any) {
      setStatusMessage(error.message || 'Unable to resume payment.');
      setResumingPayment(false);
    }
  };

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

      {isHod ? (
        <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
          {([
            ['orders', 'My orders'],
            ['approvals', 'Approvals'],
            ['history', `${hodDepartment || 'Department'} history`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                tab === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {isHod && tab === 'approvals' ? <HodPanel mode="approvals" /> : null}
      {isHod && tab === 'history' ? <HodPanel mode="history" /> : null}

      {!isHod || tab === 'orders' ? (
        <>
      {statusMessage ? <Card className="text-sm font-medium text-slate-700">{statusMessage}</Card> : null}

      {activeOrder ? (
        <Card className="overflow-hidden border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-slate-50 p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-700">Active order</p>
                <div className="font-[var(--font-space-grotesk)] text-7xl font-bold tracking-tight text-brand-700">{displayToken(activeOrder.token)}</div>
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
                        <div className="font-[var(--font-space-grotesk)] text-3xl font-bold text-slate-950">{displayToken(order.token)}</div>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-rose-700">Reason: {order.rejection_reason ?? 'Order rejected by operator. Please retry with corrected files.'}</p>
                  </Card>
                );
              }

              return (
                <StudentOrderCard
                  key={order.id}
                  order={order}
                  onContinuePayment={isStaff ? undefined : handleContinuePayment}
                />
              );
            })}
          </div>
        ) : null}
      </div>
        </>
      ) : null}

      {resumingPayment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <Card className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Processing Payment</h3>
              <p className="text-sm text-slate-600">Please wait while we secure your order...</p>
            </div>
          </Card>
        </div>
      )}

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
