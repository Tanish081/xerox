import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

type ShopRow = {
  id: string;
  name: string;
  upi_id: string;
  avg_time_per_10_pages: number;
  is_open: boolean;
};

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const [{ data: shops, error: shopsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabaseAdmin.from('shops').select('id,name,upi_id,avg_time_per_10_pages,is_open').eq('is_open', true).order('name'),
    supabaseAdmin.from('orders').select('shop_id,status').in('status', ['queued', 'processing']),
  ]);

  if (shopsError) {
    return NextResponse.json({ error: shopsError.message }, { status: 400 });
  }

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 400 });
  }

  const queueDepthByShop = new Map<string, number>();
  for (const order of (orders ?? []) as Array<{ shop_id: string }>) {
    queueDepthByShop.set(order.shop_id, (queueDepthByShop.get(order.shop_id) ?? 0) + 1);
  }

  const data = ((shops ?? []) as ShopRow[]).map((shop) => {
    const queueDepth = queueDepthByShop.get(shop.id) ?? 0;
    const waitMinutes = queueDepth * Math.max(1, Number(shop.avg_time_per_10_pages) || 1);

    return {
      ...shop,
      queueDepth,
      waitMinutes,
      waitLabel: queueDepth === 0 ? 'No wait' : `${waitMinutes} min`,
      waitTone: queueDepth === 0 ? 'emerald' : queueDepth > 5 ? 'rose' : 'amber',
    };
  });

  return NextResponse.json({ data });
}