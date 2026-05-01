import { estimateQueueWaitMinutes, formatQueueWait, queueTone } from '@/lib/queue';

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => any;
  };
};

export type ShopPickerShop = {
  id: string;
  name: string;
  upi_id: string;
  avg_time_per_10_pages: number;
  is_open: boolean;
  queueDepth: number;
  waitMinutes: number;
  waitLabel: string;
  waitTone: 'emerald' | 'amber' | 'rose';
};

export async function loadOpenShopsWithQueueStats(supabaseClient: SupabaseLike): Promise<ShopPickerShop[]> {
  const [{ data: shops, error: shopsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabaseClient.from('shops').select('id,name,upi_id,avg_time_per_10_pages,is_open').eq('is_open', true).order('name'),
    supabaseClient.from('orders').select('shop_id,status').in('status', ['queued', 'processing']),
  ]);

  if (shopsError) {
    throw new Error(`Failed to load xerox centers: ${shopsError.message}`);
  }

  if (ordersError) {
    throw new Error(`Failed to load queue stats: ${ordersError.message}`);
  }

  const queueDepthByShop = new Map<string, number>();
  for (const order of (orders ?? []) as Array<{ shop_id: string }>) {
    queueDepthByShop.set(order.shop_id, (queueDepthByShop.get(order.shop_id) ?? 0) + 1);
  }

  return ((shops ?? []) as Array<{ id: string; name: string; upi_id: string; avg_time_per_10_pages: number; is_open: boolean }>).map((shop) => {
    const queueDepth = queueDepthByShop.get(shop.id) ?? 0;
    const waitMinutes = estimateQueueWaitMinutes(queueDepth, Number(shop.avg_time_per_10_pages) || 0);

    return {
      ...shop,
      queueDepth,
      waitMinutes,
      waitTone: queueTone(waitMinutes),
      waitLabel: formatQueueWait(waitMinutes),
    };
  });
}