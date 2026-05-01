import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

type RejectPayload = {
  orderId?: string;
  reason?: string;
};

function readEmailFromBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string };
    return payload.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function PATCH(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const payload = (await request.json()) as RejectPayload;
  const orderId = payload.orderId?.trim();
  const reason = payload.reason?.trim() ?? '';

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  if (reason.length < 5) {
    return NextResponse.json({ error: 'reason must be at least 5 characters' }, { status: 400 });
  }

  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!operatorEmail) {
    return NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id,shop_id')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? 'Order not found' }, { status: 404 });
  }

  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('id,operator_email')
    .eq('id', order.shop_id)
    .single();

  if (shopError || !shop) {
    return NextResponse.json({ error: shopError?.message ?? 'Shop not found' }, { status: 404 });
  }

  if ((shop.operator_email ?? '').toLowerCase() !== operatorEmail) {
    return NextResponse.json({ error: 'Not authorized to reject this order' }, { status: 403 });
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelled', rejection_reason: reason })
    .eq('id', orderId)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ data: updatedOrder });
}
