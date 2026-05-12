import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });
  }

  const operatorEmail = readEmailFromBearerToken(request.headers.get('authorization'));
  if (!operatorEmail) {
    return NextResponse.json({ error: 'Operator authentication token missing' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const shopId = String(formData.get('shopId') ?? '').trim();
    const itemName = String(formData.get('itemName') ?? '').trim();
    const image = formData.get('image') as File | null;

    if (!shopId || !itemName || !image) {
      return NextResponse.json({ error: 'shopId, itemName, and image are required' }, { status: 400 });
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('id,operator_email')
      .eq('id', shopId)
      .single();

    if (shopError || !shop) {
      return NextResponse.json({ error: shopError?.message ?? 'Shop not found' }, { status: 404 });
    }

    if ((shop.operator_email ?? '').toLowerCase() !== operatorEmail) {
      return NextResponse.json({ error: 'Not authorized for this shop' }, { status: 403 });
    }

    const ext = image.name.split('.').pop() ?? 'jpg';
    const safeName = itemName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filePath = `${shopId}/${Date.now()}-${safeName}.${ext}`;
    const bytes = Buffer.from(await image.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage.from('product-images').upload(filePath, bytes, {
      contentType: image.type || 'image/jpeg',
      upsert: true,
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data } = supabaseAdmin.storage.from('product-images').getPublicUrl(filePath);
    return NextResponse.json({ imageUrl: data.publicUrl, path: filePath });
  } catch (error) {
    console.error('Operator image upload error', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}
