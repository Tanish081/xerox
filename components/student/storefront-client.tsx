'use client';

import { useState, useEffect } from 'react';
import { getStudentSession } from '@/lib/student-session';
import { ensureStudentFlowReady } from '@/lib/student-route-guard';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/shared/button';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type CartItem = { id: string; name: string; price: number; quantity: number; image_url: string | null };

type CheckoutState = 'cart' | 'payment' | 'success';

async function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Razorpay checkout.'));
    document.body.appendChild(script);
  });
}

export function StorefrontClient() {
  const router = useRouter();
  const [shopId, setShopId] = useState('');
  const [shopName, setShopName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('cart');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [orderToken, setOrderToken] = useState('');
  const [razorpayPaymentId, setRazorpayPaymentId] = useState('');

  useEffect(() => {
    void (async () => {
      const ok = await ensureStudentFlowReady(router);
      if (!ok) return;

      const session = getStudentSession();
      if (!session?.studentId) return;

      setShopId(session.shopId);
      setShopName(session.shopName);
      setStudentId(session.studentId);
    })();
  }, [router]);

  useEffect(() => {
    if (shopId) fetchItems();
  }, [shopId]);

  const fetchItems = async () => {
    setLoading(true);
    const { supabaseBrowser } = await import('@/lib/supabase');
    const { data } = await supabaseBrowser
      .from('stationary_items')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_available', true)
      .gt('stock_quantity', 0)
      .order('created_at', { ascending: true });

    setItems(data ?? []);
    setLoading(false);
  };

  const updateCart = (id: string, delta: number) => {
    setCart(prev => {
      const current = prev[id] ?? 0;
      const next = current + delta;
      const item = items.find(i => i.id === id);
      if (!item || next < 0 || next > item.stock_quantity) return prev;
      const newCart = { ...prev };
      if (next === 0) delete newCart[id];
      else newCart[id] = next;
      return newCart;
    });
  };

  const cartEntries: CartItem[] = Object.entries(cart).flatMap(([id, qty]) => {
    const item = items.find(i => i.id === id);
    return item ? [{ id, name: item.name, price: item.price, quantity: qty, image_url: item.image_url ?? null }] : [];
  });

  const cartTotal = cartEntries.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalItems = cartEntries.reduce((sum, i) => sum + i.quantity, 0);

  /** Places order after Razorpay payment id is verified server-side in the handler. */
  const submitStorefrontOrder = async (paymentId: string) => {
    if (!studentId || !shopId) {
      setError('Session expired. Please log in again.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const token = `PQ-${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '')}-S-${Math.floor(100 + Math.random() * 900)}`;
      const stationaryCart = cartEntries.map(i => ({ id: i.id, name: i.name, qty: i.quantity, unit_price: i.price }));

      const formData = new FormData();
      formData.append('studentId', studentId);
      formData.append('shopId', shopId);
      formData.append('token', token);
      formData.append('stationaryCart', JSON.stringify(stationaryCart));
      formData.append('estimatedAmount', cartTotal.toFixed(2));
      formData.append('utrNumber', paymentId);

      const resp = await fetch('/api/student/orders/storefront', { method: 'POST', body: formData });
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload.error || 'Failed to place order.');
      setRazorpayPaymentId(paymentId);
      setOrderToken(payload.token ?? token);
      setCheckoutState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRazorpayCheckout = async () => {
    if (!studentId || !shopId || cartTotal <= 0) {
      setError('Cart or session is invalid.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await loadRazorpayScript();
      const receipt = `sf-${shopId}-${Date.now()}`;

      const createOrderResponse = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cartTotal,
          receipt,
        }),
      });

      const createOrderPayload = await createOrderResponse.json();
      if (!createOrderResponse.ok) {
        throw new Error(createOrderPayload.error || 'Unable to create payment order.');
      }

      const { paymentId } = await new Promise<{ paymentId: string }>((resolve, reject) => {
        const RazorpayCheckout = window.Razorpay;
        if (!RazorpayCheckout) {
          reject(new Error('Razorpay checkout is unavailable.'));
          return;
        }

        const razorpay = new RazorpayCheckout({
          key: createOrderPayload.key,
          amount: createOrderPayload.amount,
          currency: createOrderPayload.currency,
          name: 'PrintQ Stationery',
          description: `${shopName || 'Order'} · ₹${cartTotal.toFixed(2)}`,
          order_id: createOrderPayload.orderId,
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const verifyResponse = await fetch('/api/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(response),
              });
              const verifyPayload = await verifyResponse.json();
              if (!verifyResponse.ok || !verifyPayload.verified) {
                reject(new Error(verifyPayload.error || 'Payment verification failed.'));
                return;
              }
              resolve({ paymentId: response.razorpay_payment_id });
            } catch (e) {
              reject(e);
            }
          },
          modal: {
            ondismiss: () => reject(new Error('Payment was cancelled.')),
          },
          theme: { color: '#2563eb' },
        });

        razorpay.open();
      });

      await submitStorefrontOrder(paymentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
      setSubmitting(false);
    }
  };

  // ── Success screen ───────────────────────────────────────────────────────────
  if (checkoutState === 'success') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 rounded-3xl bg-white p-8 text-center shadow-xl ring-1 ring-slate-100">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-600">✓</div>
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Order Placed!</h2>
            <p className="mt-1 text-sm text-slate-500">Show this token at the counter.</p>
          </div>
          <div className="rounded-2xl bg-slate-950 px-6 py-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Token</p>
            <p className="mt-1 font-mono text-3xl font-bold">{orderToken}</p>
            {razorpayPaymentId ? (
              <p className="mt-2 text-left text-xs text-slate-400">Payment: {razorpayPaymentId}</p>
            ) : null}
          </div>
          <Button className="w-full rounded-xl" onClick={() => router.push('/student/dashboard')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  // ── Payment screen ───────────────────────────────────────────────────────────
  if (checkoutState === 'payment') {
    return (
      <div className="mx-auto max-w-md space-y-6 p-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setCheckoutState('cart')} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">←</button>
          <h2 className="text-2xl font-bold text-slate-950">Payment</h2>
        </div>

        {/* Order summary */}
        <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
          <p className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-widest">Order Summary</p>
          {cartEntries.map(i => (
            <div key={i.id} className="flex justify-between py-1.5 text-sm">
              <span className="text-slate-700">{i.name} × {i.quantity}</span>
              <span className="font-semibold text-slate-900">₹{(i.price * i.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-brand-700">
            <span>Total</span>
            <span>₹{cartTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-700">
          <p className="text-sm font-semibold text-slate-900">Pay with Razorpay</p>
          <p className="mt-1 text-xs text-slate-500">
            Uses test keys from your `.env` in development. After paying, your order is submitted automatically.
          </p>
        </div>

        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <Button className="w-full rounded-xl" onClick={() => void handleRazorpayCheckout()} disabled={submitting}>
          {submitting ? 'Processing…' : 'Pay with Razorpay'}
        </Button>
      </div>
    );
  }

  // ── Main store ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{shopName}</p>
            <h1 className="text-2xl font-bold text-slate-950">Stationery Store</h1>
          </div>
          <button onClick={() => router.push('/student/dashboard')} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">
            ← Back
          </button>
        </div>
      </div>

      {/* Product grid */}
      <div className="mx-auto max-w-4xl px-4 pt-6">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <div key={n} className="h-72 animate-pulse rounded-3xl bg-slate-200" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-100">
            No products are available right now. Please check again later.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(item => {
              const qty = cart[item.id] ?? 0;
              return (
                <div key={item.id} className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:shadow-md">
                  <div className="relative h-44 overflow-hidden bg-slate-100">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-200 text-4xl text-slate-400">📦</div>
                    )}
                    <div className="absolute top-3 right-3 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-900 shadow">
                      ₹{item.price}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-5">
                    <div>
                      <h3 className="font-bold text-slate-900">{item.name}</h3>
                      {item.description && <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>}
                      <p className="mt-2 text-xs text-slate-400">Stock: {item.stock_quantity}</p>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      {qty === 0 ? (
                        <Button className="w-full rounded-xl" onClick={() => updateCart(item.id, 1)}>
                          Add to Cart
                        </Button>
                      ) : (
                        <div className="flex w-full items-center justify-between rounded-xl bg-brand-50 ring-1 ring-brand-200">
                          <button onClick={() => updateCart(item.id, -1)} className="w-10 h-10 flex items-center justify-center rounded-l-xl text-brand-700 hover:bg-brand-100 text-lg font-bold">−</button>
                          <span className="font-bold text-brand-900">{qty}</span>
                          <button onClick={() => updateCart(item.id, 1)} disabled={qty >= item.stock_quantity} className="w-10 h-10 flex items-center justify-center rounded-r-xl text-brand-700 hover:bg-brand-100 text-lg font-bold disabled:opacity-40">+</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating cart bar */}
      {totalItems > 0 && (
        <div className="fixed bottom-6 left-0 right-0 z-50 px-4">
          <div className="mx-auto max-w-md flex items-center justify-between rounded-2xl bg-slate-950 px-6 py-4 text-white shadow-2xl">
            <div>
              <p className="text-xs text-slate-400">{totalItems} item{totalItems > 1 ? 's' : ''} in cart</p>
              <p className="text-xl font-bold">₹{cartTotal.toFixed(2)}</p>
            </div>
            <Button
              className="rounded-xl bg-brand-500 px-6 hover:bg-brand-600"
              onClick={() => setCheckoutState('payment')}
            >
              Proceed to Pay →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
