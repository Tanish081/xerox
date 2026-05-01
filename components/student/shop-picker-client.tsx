"use client";

import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { StudentShopCard } from '@/components/student/shop-card';
import { setSelectedShop } from '@/lib/student-session';
import type { ShopPickerShop } from '@/lib/shops';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function StudentShopPickerClient() {
  const router = useRouter();
  const [shops, setShops] = useState<ShopPickerShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadShops() {
      setLoading(true);
      setMessage('');

      try {
        const response = await fetch('/api/student/shops');
        const payload = (await response.json()) as { data?: ShopPickerShop[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load xerox centers.');
        }

        setShops(payload.data ?? []);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load xerox centers.');
      } finally {
        setLoading(false);
      }
    }

    void loadShops();
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-3 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-brand-700">📄 PrintQ</p>
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Pick your xerox center</h2>
          <p className="mt-2 text-sm text-slate-600">Choose the nearest campus print shop to get started.</p>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
              <LoadingSkeleton className="h-5 w-3/4" />
              <LoadingSkeleton className="h-6 w-24 rounded-full" />
              <LoadingSkeleton className="h-4 w-2/3" />
              <LoadingSkeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && shops.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-600 shadow-sm">No centers available right now. Check back soon.</div>
      ) : null}

      {!loading && shops.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {shops.map((shop) => (
            <StudentShopCard
              key={shop.id}
              shop={shop}
              onClick={() => {
                setSelectedShop({
                  id: shop.id,
                  name: shop.name,
                  upi_id: shop.upi_id,
                  avg_time_per_10_pages: shop.avg_time_per_10_pages,
                });
                router.push('/student/identify');
              }}
            />
          ))}
        </div>
      ) : null}

      {message ? <p className="text-center text-sm font-medium text-rose-600">{message}</p> : null}
    </div>
  );
}