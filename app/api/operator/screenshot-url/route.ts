import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId')?.trim();

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required.' }, { status: 400 });
  }

  // Fetch order to get shop_id, payment_screenshot_url, payment_verified
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, shop_id, payment_screenshot_url, payment_verified')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  let storagePath: string | null = order.payment_screenshot_url ?? null;

  // If URL not saved in DB but payment was verified, find the file in storage
  if (!storagePath && order.payment_verified) {
    const folder = `${order.shop_id}/${order.id}`;
    const { data: files } = await supabaseAdmin.storage
      .from('payment-screenshots')
      .list(folder, { limit: 1 });
    const file = files?.[0];
    if (file) {
      storagePath = `${folder}/${file.name}`;
      // Persist the discovered path so future loads are instant
      await supabaseAdmin
        .from('orders')
        .update({ payment_screenshot_url: storagePath })
        .eq('id', orderId);
    }
  }

  if (!storagePath) {
    return NextResponse.json({ signedUrl: null });
  }

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from('payment-screenshots')
    .createSignedUrl(storagePath, 3600);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message ?? 'Failed to sign URL.' }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: signed.signedUrl, storagePath });
}
