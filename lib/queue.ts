import type { Order, QueueOrder } from '@/types';

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => any;
    update: (values: Record<string, unknown>) => any;
  };
};

function processingMinutes(filePageCount: number | null | undefined, avgTimePer10Pages: number) {
  const pages = filePageCount && filePageCount > 0 ? filePageCount : 0;
  return Math.max(1, Math.ceil(pages / 10)) * avgTimePer10Pages;
}

export function estimateQueueWaitMinutes(queueDepth: number, avgTimePer10Pages: number) {
  return Math.max(0, queueDepth) * Math.max(0, avgTimePer10Pages);
}

export function formatQueueWait(minutes: number) {
  return `~${Math.max(0, Math.round(minutes))} min wait`;
}

export function queueTone(minutes: number) {
  if (minutes < 10) return 'emerald';
  if (minutes <= 20) return 'amber';
  return 'rose';
}

function rank(order: Pick<Order, 'status' | 'priority_class'>) {
  if (order.status === 'processing') return 0;
  if (order.priority_class === 'A') return 1;
  if (order.priority_class === 'B') return 2;
  return 3;
}

export async function calculateEstimatedReadyTime(orderId: string, shopId: string, supabaseClient: SupabaseLike): Promise<Date> {
  const now = new Date();

  const { data: shop, error: shopError } = await supabaseClient.from('shops').select('avg_time_per_10_pages').eq('id', shopId).single();
  if (shopError) {
    throw new Error(`Failed to load shop settings: ${shopError.message}`);
  }

  const { data: orders, error } = await supabaseClient
    .from('orders')
    .select('id,status,priority_class,file_page_count')
    .eq('shop_id', shopId)
    .in('status', ['queued', 'processing']);

  if (error) {
    throw new Error(`Failed to load queue: ${error.message}`);
  }

  const queueOrders = ((orders ?? []) as QueueOrder[]).sort((left, right) => rank(left) - rank(right));

  let minutesAhead = 0;
  for (const order of queueOrders) {
    if (order.id === orderId) {
      break;
    }
    minutesAhead += processingMinutes(order.file_page_count, Number((shop as { avg_time_per_10_pages: number }).avg_time_per_10_pages));
  }

  const estimatedReadyTime = new Date(now.getTime() + minutesAhead * 60 * 1000);
  const { error: updateError } = await supabaseClient.from('orders').update({ estimated_ready_time: estimatedReadyTime.toISOString() }).eq('id', orderId);
  if (updateError) {
    throw new Error(`Failed to update estimated ready time: ${updateError.message}`);
  }

  return estimatedReadyTime;
}
