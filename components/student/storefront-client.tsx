'use client';

import { useState, useEffect } from 'react';
import { getStudentSession } from '@/lib/student-session';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/shared/button';

// ── Dummy fallback items shown when no items exist in DB yet ──────────────────
const DUMMY_ITEMS = [
  { id: 'dummy-1', name: 'Blue Gel Pen', price: 10, stock_quantity: 50, is_available: true, image_url: 'https://images.unsplash.com/photo-1583485088034-697b5a69f000?auto=format&fit=crop&w=400&q=80', description: 'Smooth writing 0.5mm gel ink' },
  { id: 'dummy-2', name: 'A4 Printing Paper (500 sheets)', price: 250, stock_quantity: 20, is_available: true, image_url: 'https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?auto=format&fit=crop&w=400&q=80', description: '75 GSM premium printing paper' },
  { id: 'dummy-3', name: 'Highlighter Set (5 colours)', price: 80, stock_quantity: 30, is_available: true, image_url: 'https://images.unsplash.com/photo-1596073419667-9d77d59f033f?auto=format&fit=crop&w=400&q=80', description: 'Fluorescent ink, chisel tip' },
  { id: 'dummy-4', name: 'Black Marker', price: 25, stock_quantity: 40, is_available: true, image_url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80', description: 'Permanent, waterproof ink' },
  { id: 'dummy-5', name: 'Stapler (Mini)', price: 75, stock_quantity: 15, is_available: true, image_url: 'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=400&q=80', description: 'Includes 100 staple pins' },
  { id: 'dummy-6', name: 'Spiral Notebook (200 pages)', price: 120, stock_quantity: 25, is_available: true, image_url: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=400&q=80', description: 'A5 size, single rule' },
];

type CartItem = { id: string; name: string; price: number; quantity: number; image_url: string; };

type CheckoutState = 'cart' | 'payment' | 'success';

export function StorefrontClient() {
  const router = useRouter();
  const [shopId, setShopId] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopUpiId, setShopUpiId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('cart');
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [orderToken, setOrderToken] = useState('');

  useEffect(() => {
    const session = getStudentSession();
    if (!session?.studentId) {
      router.replace('/student/identify');
      return;
    }
    setShopId(session.shopId);
    setShopName(session.shopName);
    setShopUpiId(session.shopUpiId);
    setStudentId(session.studentId);
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
      .order('created_at', { ascending: true });

    setItems(data && data.length > 0 ? data : DUMMY_ITEMS);
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
    return item ? [{ id, name: item.name, price: item.price, quantity: qty, image_url: item.image_url }] : [];
  });

  const cartTotal = cartEntries.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalItems = cartEntries.reduce((sum, i) => sum + i.quantity, 0);

  const handleCheckout = async () => {
    if (!paymentScreenshot) { setError('Please upload your payment screenshot.'); return; }
    if (!studentId || !shopId) { setError('Session expired. Please log in again.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const token = `PQ-${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '')}-S-${Math.floor(100 + Math.random() * 900)}`;
      const stationaryCart = cartEntries.map(i => ({ id: i.id, name: i.name, qty: i.quantity, unit_price: i.price }));

      // Use FormData to send the screenshot along with order details
      const formData = new FormData();
      formData.append('screenshot', paymentScreenshot);
      formData.append('studentId', studentId);
      formData.append('shopId', shopId);
      formData.append('token', token);
      formData.append('stationaryCart', JSON.stringify(stationaryCart));
      formData.append('estimatedAmount', cartTotal.toFixed(2));
      formData.append('utrNumber', utrNumber);

      const resp = await fetch('/api/student/orders/storefront', { method: 'POST', body: formData });
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload.error || 'Failed to place order.');
      setOrderToken(payload.token ?? token);
      setCheckoutState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
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

        {/* UPI pay block */}
        <div className="rounded-2xl bg-slate-950 p-5 text-white">
          <p className="text-xs text-slate-400">Pay to UPI</p>
          <p className="mt-1 text-xl font-bold">{shopUpiId || 'Loading...'}</p>
          <p className="mt-1 text-2xl font-bold">₹{cartTotal.toFixed(2)}</p>
          <a
            href={`upi://pay?pa=${shopUpiId}&am=${cartTotal.toFixed(2)}&tn=PrintQ+Stationery`}
            className="mt-3 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Open UPI App
          </a>
        </div>

        {/* Screenshot upload */}
        <div className="space-y-3">
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition ${paymentScreenshot ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-brand-400 hover:bg-brand-50/40'}`}>
            <input type="file" accept="image/*" className="hidden" onChange={e => setPaymentScreenshot(e.target.files?.[0] ?? null)} />
            {paymentScreenshot
              ? <p className="text-sm font-semibold text-emerald-700">✓ {paymentScreenshot.name}</p>
              : <><p className="text-sm font-semibold text-slate-700">Upload payment screenshot</p><p className="text-xs text-slate-400">Tap to browse</p></>
            }
          </label>
          <input
            type="text"
            value={utrNumber}
            onChange={e => setUtrNumber(e.target.value)}
            placeholder="UTR / Reference number (optional)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <Button className="w-full rounded-xl" onClick={handleCheckout} disabled={submitting || !paymentScreenshot}>
          {submitting ? 'Placing order…' : 'Confirm Order'}
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
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(item => {
              const qty = cart[item.id] ?? 0;
              return (
                <div key={item.id} className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:shadow-md">
                  <div className="relative h-44 overflow-hidden bg-slate-100">
                    <img src={item.image_url} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
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
