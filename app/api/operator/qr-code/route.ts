import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function readEmailFromBearer(authHeader: string | null): string | null {
  if (!authHeader?.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string };
    return payload.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

// POST: upload a new QR code image for the operator's shop
export async function POST(request: Request) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Service role key missing.' }, { status: 500 });

  const operatorEmail = readEmailFromBearer(request.headers.get('authorization'));
  if (!operatorEmail) return NextResponse.json({ error: 'Operator authentication required.' }, { status: 401 });

  const formData = await request.formData();
  const shopId = (formData.get('shopId') as string | null)?.trim();
  const file = formData.get('qrImage') as File | null;

  if (!shopId || !file) {
    return NextResponse.json({ error: 'shopId and qrImage are required.' }, { status: 400 });
  }

  // Verify operator owns this shop
  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('id, operator_email, payment_qr_url')
    .eq('id', shopId)
    .single();

  if (shopError || !shop) return NextResponse.json({ error: 'Shop not found.' }, { status: 404 });
  if (shop.operator_email?.toLowerCase() !== operatorEmail) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  // Delete old QR if one exists
  if (shop.payment_qr_url) {
    const oldPath = shop.payment_qr_url.split('/shop-qr-codes/').at(-1);
    if (oldPath) {
      await supabaseAdmin.storage.from('shop-qr-codes').remove([decodeURIComponent(oldPath)]);
    }
  }

  const ext = file.name.split('.').at(-1) ?? 'png';
  const storagePath = `${shopId}/payment-qr.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from('shop-qr-codes')
    .upload(storagePath, buffer, { contentType: file.type || 'image/png', upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = supabaseAdmin.storage.from('shop-qr-codes').getPublicUrl(storagePath);

  const { error: updateError } = await supabaseAdmin
    .from('shops')
    .update({ payment_qr_url: urlData.publicUrl })
    .eq('id', shopId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ payment_qr_url: urlData.publicUrl });
}

// DELETE: remove QR code for the operator's shop
export async function DELETE(request: Request) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Service role key missing.' }, { status: 500 });

  const operatorEmail = readEmailFromBearer(request.headers.get('authorization'));
  if (!operatorEmail) return NextResponse.json({ error: 'Operator authentication required.' }, { status: 401 });

  const { shopId } = (await request.json()) as { shopId?: string };
  if (!shopId) return NextResponse.json({ error: 'shopId is required.' }, { status: 400 });

  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('id, operator_email, payment_qr_url')
    .eq('id', shopId)
    .single();

  if (shopError || !shop) return NextResponse.json({ error: 'Shop not found.' }, { status: 404 });
  if (shop.operator_email?.toLowerCase() !== operatorEmail) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  if (shop.payment_qr_url) {
    const oldPath = shop.payment_qr_url.split('/shop-qr-codes/').at(-1);
    if (oldPath) {
      await supabaseAdmin.storage.from('shop-qr-codes').remove([decodeURIComponent(oldPath)]);
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('shops')
    .update({ payment_qr_url: null })
    .eq('id', shopId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
