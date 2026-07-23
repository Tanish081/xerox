import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function readEmailFromBearerToken(authHeader: string | null) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;
  const parts = authHeader.slice(7).split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string };
    return payload.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Signed URL for an order's uploaded document, so the operator can open it in a
 * new tab. `print-files` is private and RLS blocks the operator's browser
 * client, so the signing happens here with the service role — gated on the
 * caller actually operating the shop that owns the order.
 */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database admin access not configured.' }, { status: 500 });
  }

  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!operatorEmail) {
    return NextResponse.json({ error: 'Operator authentication token missing.' }, { status: 401 });
  }

  const orderId = new URL(request.url).searchParams.get('orderId')?.trim();
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required.' }, { status: 400 });
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, shop_id, file_url, file_name')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id, operator_email')
    .eq('id', order.shop_id)
    .maybeSingle();

  if (!shop || (shop.operator_email ?? '').toLowerCase() !== operatorEmail) {
    return NextResponse.json({ error: 'Not authorized for this order.' }, { status: 403 });
  }

  if (!order.file_url) {
    return NextResponse.json({ signedUrl: null, fileName: order.file_name ?? null });
  }

  const { data: signed, error } = await supabaseAdmin.storage
    .from('print-files')
    .createSignedUrl(order.file_url, 3600);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Failed to sign the document URL.' }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    fileName: order.file_name ?? order.file_url.split('/').at(-1) ?? 'document',
    storagePath: order.file_url,
  });
}
